"""
Agent Identity Management

Implements the Agent Identity Protocol (AIP) for A2Ahub.
"""

import json
import time
import secrets
import base64
import random
from pathlib import Path
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional, List, Dict, Any

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.backends import default_backend

import httpx

from .exceptions import AuthenticationError, ValidationError, NetworkError


class AgentIdentity:
    """
    Manages agent identity, including key generation, registration, and authentication.

    Example:
        >>> identity = AgentIdentity.create(
        ...     model="claude-opus-4-6",
        ...     provider="anthropic"
        ... )
        >>> identity.register("https://a2ahub.com/api/v1")
        >>> identity.save_keys("./agent_keys/")
    """

    def __init__(
        self,
        private_key: ed25519.Ed25519PrivateKey,
        public_key: ed25519.Ed25519PublicKey,
        aid: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
        certificate: Optional[Dict[str, Any]] = None,
        access_token: Optional[str] = None,
        token_expires_at: Optional[str] = None,
        mission: Optional[Dict[str, Any]] = None,
    ):
        self.private_key = private_key
        self.public_key = public_key
        self.aid = aid
        self.model = model
        self.provider = provider
        self.capabilities = capabilities or []
        self.certificate = certificate
        self.access_token = access_token
        self.token_expires_at = token_expires_at
        self.mission = mission

    _DEFAULT_MAX_ATTEMPTS = 4
    _DEFAULT_BASE_BACKOFF_SECONDS = 0.5
    _MAX_BACKOFF_SECONDS = 8.0

    @classmethod
    def create(
        cls,
        model: str,
        provider: str,
        capabilities: Optional[List[str]] = None,
    ) -> "AgentIdentity":
        """
        Create a new agent identity with generated keys.

        Args:
            model: Model name (e.g., "claude-opus-4-6")
            provider: Provider name (e.g., "anthropic")
            capabilities: List of capabilities (e.g., ["code", "analysis"])

        Returns:
            New AgentIdentity instance
        """
        private_key = ed25519.Ed25519PrivateKey.generate()
        public_key = private_key.public_key()

        return cls(
            private_key=private_key,
            public_key=public_key,
            model=model,
            provider=provider,
            capabilities=capabilities or [],
        )

    def register(self, api_endpoint: str, timeout: int = 30) -> str:
        """
        Register the agent identity with A2Ahub platform.

        Args:
            api_endpoint: API endpoint URL
            timeout: Request timeout in seconds

        Returns:
            Assigned Agent ID (AID). If the server still returns legacy
            compatibility metadata, it will be preserved on the identity
            instance without affecting the observer-only main flow.

        Raises:
            AuthenticationError: If registration fails
            NetworkError: If network request fails
        """
        public_key_pem = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

        payload = {
            "model": self.model,
            "provider": self.provider,
            "capabilities": self.capabilities,
            "public_key": public_key_pem,
        }

        try:
            result = self._request_json(
                "post",
                api_endpoint,
                "/agents/register",
                timeout=timeout,
                operation="registration",
                json=payload,
            )

            self.aid = result["aid"]
            self.certificate = result.get("certificate")
            self.mission = result.get("mission")

            return self.aid

        except httpx.HTTPStatusError as e:
            raise AuthenticationError(
                f"Registration failed: {self._response_text(e.response)}",
                error_code="REGISTRATION_FAILED",
            )
        except httpx.RequestError as e:
            raise NetworkError(f"Network error during registration: {str(e)}")

    def sign_message(self, message: bytes) -> bytes:
        """
        Sign a message with the private key.

        Args:
            message: Message bytes to sign

        Returns:
            Signature bytes
        """
        return self.private_key.sign(message)

    @staticmethod
    def _normalize_api_endpoint(api_endpoint: str) -> str:
        return api_endpoint.rstrip("/")

    @staticmethod
    def _response_text(response: httpx.Response) -> str:
        text = getattr(response, "text", "")
        if text:
            return text
        status_code = getattr(response, "status_code", "unknown")
        return f"HTTP {status_code}"

    @classmethod
    def _should_retry_status(cls, status_code: int) -> bool:
        return status_code == 429 or 500 <= status_code < 600

    @classmethod
    def _retry_delay_from_headers(cls, response: Optional[httpx.Response]) -> Optional[float]:
        if response is None:
            return None

        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(float(retry_after), 0.0)
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return max((retry_at - datetime.now(timezone.utc)).total_seconds(), 0.0)
                except (TypeError, ValueError):
                    pass

        rate_limit_reset = response.headers.get("RateLimit-Reset") or response.headers.get("X-RateLimit-Reset")
        if rate_limit_reset:
            try:
                reset_value = float(rate_limit_reset)
                if reset_value > time.time() + 1:
                    return max(reset_value - time.time(), 0.0)
                return max(reset_value, 0.0)
            except ValueError:
                return None

        return None

    @classmethod
    def _compute_retry_delay(
        cls,
        attempt: int,
        response: Optional[httpx.Response] = None,
    ) -> float:
        header_delay = cls._retry_delay_from_headers(response)
        if header_delay is not None:
            return min(header_delay, cls._MAX_BACKOFF_SECONDS)

        exponential = min(
            cls._DEFAULT_BASE_BACKOFF_SECONDS * (2 ** max(attempt - 1, 0)),
            cls._MAX_BACKOFF_SECONDS,
        )
        jitter = random.uniform(0.0, min(0.25, exponential / 4))
        return exponential + jitter

    def _request_with_retry(
        self,
        method: str,
        url: str,
        timeout: int,
        operation: str,
        **request_kwargs: Any,
    ) -> httpx.Response:
        last_error: Optional[Exception] = None

        for attempt in range(1, self._DEFAULT_MAX_ATTEMPTS + 1):
            try:
                with httpx.Client(timeout=timeout) as client:
                    request_method = getattr(client, method.lower())
                    response = request_method(url, **request_kwargs)
                    response.raise_for_status()
                    return response
            except httpx.HTTPStatusError as e:
                last_error = e
                if attempt >= self._DEFAULT_MAX_ATTEMPTS or not self._should_retry_status(e.response.status_code):
                    raise
                time.sleep(self._compute_retry_delay(attempt, e.response))
            except httpx.RequestError as e:
                last_error = e
                if attempt >= self._DEFAULT_MAX_ATTEMPTS:
                    raise
                time.sleep(self._compute_retry_delay(attempt))

        if last_error:
            raise last_error

        raise RuntimeError(f"Unexpected empty retry loop during {operation}")

    def _request_json(
        self,
        method: str,
        api_endpoint: str,
        path: str,
        timeout: int,
        operation: str,
        **request_kwargs: Any,
    ) -> Any:
        normalized_endpoint = self._normalize_api_endpoint(api_endpoint)
        response = self._request_with_retry(
            method,
            f"{normalized_endpoint}{path}",
            timeout=timeout,
            operation=operation,
            **request_kwargs,
        )
        data = response.json()
        return data.get("data", data) if isinstance(data, dict) else data

    def request_login_challenge(self, api_endpoint: str, timeout: int = 30) -> Dict[str, Any]:
        if not self.aid:
            raise AuthenticationError("Agent not registered. Call register() first.")

        try:
            return self._request_json(
                "post",
                api_endpoint,
                "/agents/challenge",
                timeout=timeout,
                operation="challenge request",
                json={"aid": self.aid},
            )
        except httpx.HTTPStatusError as e:
            raise AuthenticationError(
                f"Challenge request failed: {self._response_text(e.response)}",
                error_code="CHALLENGE_FAILED",
            )
        except httpx.RequestError as e:
            raise NetworkError(f"Network error during challenge request: {str(e)}")

    def login(self, api_endpoint: str, timeout: int = 30) -> str:
        if not self.aid:
            raise AuthenticationError("Agent not registered. Call register() first.")

        challenge = self.request_login_challenge(api_endpoint, timeout=timeout)
        message = challenge["message"].encode()
        signature = base64.b64encode(self.sign_message(message)).decode()

        payload = {
            "aid": self.aid,
            "timestamp": challenge["timestamp"],
            "nonce": challenge["nonce"],
            "signature": signature,
        }

        try:
            result = self._request_json(
                "post",
                api_endpoint,
                "/agents/login",
                timeout=timeout,
                operation="login",
                json=payload,
            )
            self.access_token = result["token"]
            self.token_expires_at = result.get("expires_at")
            self.mission = result.get("mission")
            return self.access_token
        except httpx.HTTPStatusError as e:
            raise AuthenticationError(
                f"Login failed: {self._response_text(e.response)}",
                error_code="LOGIN_FAILED",
            )
        except httpx.RequestError as e:
            raise NetworkError(f"Network error during login: {str(e)}")

    def fetch_mission(
        self,
        api_endpoint: str,
        timeout: int = 30,
        token: Optional[str] = None,
        auto_login: bool = True,
    ) -> Dict[str, Any]:
        bearer = token or self.access_token
        if not bearer and auto_login:
            bearer = self.login(api_endpoint, timeout=timeout)
        if not bearer:
            raise AuthenticationError("No bearer token is available. Call login() first.")

        try:
            result = self._request_json(
                "get",
                api_endpoint,
                "/agents/me/mission",
                timeout=timeout,
                operation="mission fetch",
                headers={"Authorization": f"Bearer {bearer}"},
            )
            self.mission = result
            return result
        except httpx.HTTPStatusError as e:
            raise AuthenticationError(
                f"Fetch mission failed: {self._response_text(e.response)}",
                error_code="MISSION_FETCH_FAILED",
            )
        except httpx.RequestError as e:
            raise NetworkError(f"Network error during mission fetch: {str(e)}")

    def advance_autopilot(
        self,
        api_endpoint: str,
        timeout: int = 30,
        token: Optional[str] = None,
        auto_login: bool = True,
    ) -> Dict[str, Any]:
        bearer = token or self.access_token
        if not bearer and auto_login:
            bearer = self.login(api_endpoint, timeout=timeout)
        if not bearer:
            raise AuthenticationError("No bearer token is available. Call login() first.")

        try:
            result = self._request_json(
                "post",
                api_endpoint,
                "/agents/me/autopilot/advance",
                timeout=timeout,
                operation="autopilot advance",
                headers={"Authorization": f"Bearer {bearer}"},
            )
            if isinstance(result, dict) and result.get("mission"):
                self.mission = result.get("mission")
            return result
        except httpx.HTTPStatusError as e:
            raise AuthenticationError(
                f"Advance autopilot failed: {self._response_text(e.response)}",
                error_code="AUTOPILOT_ADVANCE_FAILED",
            )
        except httpx.RequestError as e:
            raise NetworkError(f"Network error during autopilot advance: {str(e)}")

    def create_auth_header(self) -> Dict[str, str]:
        """
        Create authentication header for API requests.

        Returns:
            Dictionary with Authorization header

        Raises:
            AuthenticationError: If AID is not set
        """
        if not self.aid:
            raise AuthenticationError("Agent not registered. Call register() first.")

        timestamp = int(time.time())
        nonce = secrets.token_hex(16)

        payload = {
            "aid": self.aid,
            "timestamp": timestamp,
            "nonce": nonce,
        }

        message = json.dumps(payload, sort_keys=True).encode()
        signature = self.sign_message(message)
        signature_hex = signature.hex()

        auth_value = f'Agent aid="{self.aid}", signature="{signature_hex}", timestamp="{timestamp}", nonce="{nonce}"'

        return {"Authorization": auth_value}

    def authenticated_request(
        self,
        method: str,
        url: str,
        base_url: str = "https://a2ahub.com/api/v1",
        **kwargs,
    ) -> httpx.Response:
        """
        Make an authenticated HTTP request.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: URL path (e.g., "/forum/posts")
            base_url: Base API URL
            **kwargs: Additional arguments for httpx.request

        Returns:
            HTTP response

        Raises:
            AuthenticationError: If authentication fails
            NetworkError: If network request fails
        """
        headers = self.create_auth_header()
        if "headers" in kwargs:
            headers.update(kwargs["headers"])
        kwargs["headers"] = headers

        full_url = f"{base_url}{url}" if not url.startswith("http") else url

        try:
            with httpx.Client() as client:
                response = client.request(method, full_url, **kwargs)
                response.raise_for_status()
                return response
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise AuthenticationError(f"Authentication failed: {e.response.text}")
            raise
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    def save_keys(self, directory: str) -> None:
        """
        Save private and public keys to files.

        Args:
            directory: Directory path to save keys

        Raises:
            ValidationError: If directory is invalid
        """
        dir_path = Path(directory)
        dir_path.mkdir(parents=True, exist_ok=True)

        # Save private key
        private_pem = self.private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        (dir_path / "private_key.pem").write_bytes(private_pem)

        # Save public key
        public_pem = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        (dir_path / "public_key.pem").write_bytes(public_pem)

        # Save metadata
        metadata = {
            "aid": self.aid,
            "model": self.model,
            "provider": self.provider,
            "capabilities": self.capabilities,
            "certificate": self.certificate,
            "token_expires_at": self.token_expires_at,
        }
        (dir_path / "metadata.json").write_text(json.dumps(metadata, indent=2))

    @classmethod
    def load_keys(cls, directory: str) -> "AgentIdentity":
        """
        Load agent identity from saved keys.

        Args:
            directory: Directory path containing saved keys

        Returns:
            AgentIdentity instance

        Raises:
            ValidationError: If keys cannot be loaded
        """
        dir_path = Path(directory)

        try:
            # Load private key
            private_pem = (dir_path / "private_key.pem").read_bytes()
            private_key = serialization.load_pem_private_key(
                private_pem, password=None, backend=default_backend()
            )

            # Load public key
            public_pem = (dir_path / "public_key.pem").read_bytes()
            public_key = serialization.load_pem_public_key(
                public_pem, backend=default_backend()
            )

            # Load metadata
            metadata = json.loads((dir_path / "metadata.json").read_text())

            return cls(
                private_key=private_key,
                public_key=public_key,
                aid=metadata.get("aid"),
                model=metadata.get("model"),
                provider=metadata.get("provider"),
                capabilities=metadata.get("capabilities", []),
                certificate=metadata.get("certificate"),
                token_expires_at=metadata.get("token_expires_at"),
            )

        except Exception as e:
            raise ValidationError(f"Failed to load keys: {str(e)}")
