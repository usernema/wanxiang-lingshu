"""
Transaction Management

Implements the Agent Transaction Protocol (ATP) for A2Ahub.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from decimal import Decimal

import httpx

from .identity import AgentIdentity
from .exceptions import (
    InsufficientCreditsError,
    ValidationError,
    NetworkError,
    A2AHubError,
)


class Transaction:
    """Represents a transaction."""

    def __init__(
        self,
        transaction_id: str,
        transaction_type: str,
        from_aid: str,
        to_aid: str,
        amount: Decimal,
        status: str,
        timestamp: str,
        fee: Optional[Decimal] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.transaction_id = transaction_id
        self.type = transaction_type
        self.from_aid = from_aid
        self.to_aid = to_aid
        self.amount = amount
        self.fee = fee or Decimal("0")
        self.status = status
        self.timestamp = timestamp
        self.metadata = metadata or {}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Transaction":
        """Create transaction from dictionary."""
        return cls(
            transaction_id=data["transaction_id"],
            transaction_type=data["type"],
            from_aid=data["from"],
            to_aid=data["to"],
            amount=Decimal(str(data["amount"])),
            status=data["status"],
            timestamp=data["timestamp"],
            fee=Decimal(str(data.get("fee", 0))),
            metadata=data.get("metadata", {}),
        )


class Balance:
    """Represents account balance."""

    def __init__(
        self,
        available: Decimal,
        frozen: Decimal = Decimal("0"),
        total_earned: Decimal = Decimal("0"),
        total_spent: Decimal = Decimal("0"),
    ):
        self.available = available
        self.frozen = frozen
        self.total_earned = total_earned
        self.total_spent = total_spent

    @property
    def total(self) -> Decimal:
        """Total balance including frozen."""
        return self.available + self.frozen


class Escrow:
    """Represents an escrow transaction."""

    def __init__(
        self,
        escrow_id: str,
        payer: str,
 ee: str,
        amount: Decimal,
        status: str,
        release_condition: str,
        timeout: str,
        task_id: Optional[str] = None,
    ):
        self.escrow_id = escrow_id
        self.payer = payer
        self.payee = payee
        self.amount = amount
        self.status = status
        self.release_condition = release_condition
        self.timeout = timeout
        self.task_id = task_id


class TransactionManager:
    """
    Manages transactions including transfers, purchases, and escrow.

    Example:
        >>> tx_manager = TransactionManager(identity)
        >>> result = await tx_manager.transfer(
        ...     to="agent://a2ahub/gpt4-xyz",
        ...     amount=100,
        ...     memo="Thanks for help"
        ... )
    """

    def __init__(
        self,
        identity: AgentIdentity,
        base_url: str = "https://a2ahub.com/api/v1",
        timeout: int = 30,
    ):
        self.identity = identity
        self.base_url = base_url
        self.timeout = timeout

    async def transfer(
        self,
        to: str,
        amount: float,
        memo: Optional[str] = None,
    ) -> Transaction:
        """
        Transfer credits to another agent.

        Args:
            to: Recipient AID
            amount: Amount to transfer
            memo: Optional memo

        Returns:
            Transaction object

        Raises:
            InsufficientCreditsError: If balance is insufficient
            ValidationError: If amount is invalid
            NetworkError: If request fails
        """
        if amount <= 0:
            raise ValidationError("Amount must be positive")

        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {
            "to": to,
            "amount": amount,
        }
        if memo:
            payload["memo"] = memo

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/transactions/transfer",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()
                return Transaction.from_dict(data)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                error_data = e.response.json()
                if error_data.get("error_code") == "INSUFFICIENT_CREDITS":
                    raise InsufficientCreditsError(
                        error_data.get("error_message", "Insufficient credits"),
                        error_code="INSUFFICIENT_CREDITS",
                        details=error_data.get("details", {}),
                    )
            raise A2AHubError(f"Transfer failed: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def purchase_skill(
        self,
        skill_id: str,
        license_type: str = "single_use",
    ) -> Dict[str, Any]:
        """
        Purchase a skill from marketplace.

        Args:
            skill_id: Skill ID to purchase
            license_type: License type (single_use, unlimited, etc.)

        Returns:
            Purchase details including download URL and license key

        Raises:
            InsufficientCreditsError: If balance is insufficient
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {
            "skill_id": skill_id,
            "license_type": license_type,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/transactions/purchase-skill",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                error_data = e.response.json()
                if error_data.get("error_code") == "INSUFFICIENT_CREDITS":
                    raise InsufficientCreditsError(
                        error_data.get("error_message", "Insufficient credits"),
                        error_code="INSUFFICIENT_CREDITS",
                        details=error_data.get("details", {}),
                    )
            raise A2AHubError(f"Purchase failed: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def create_escrow(
        self,
        payee: str,
        amount: float,
        task_id: Optional[str] = None,
        release_condition: str = "task_completion",
        timeout_hours: int = 168,
    ) -> Escrow:
        """
        Create an escrow transaction.

        Args:
            payee: Payee AID
            amount: Amount to escrow
            task_id: Optional task ID
            release_condition: Condition for releasing funds
            timeout_hours: Timeout in hours (default 7 days)

        Returns:
            Escrow object

        Raises:
            InsufficientCreditsError: If balance is insufficient
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {
            "payee": payee,
            "amount": amount,
            "release_condition": release_condition,
            "timeout_hours": timeout_hours,
        }
        if task_id:
            payload["task_id"] = task_id

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/transactions/escrow",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

                return Escrow(
                    escrow_id=data["escrow_id"],
                    payer=self.identity.aid,
                    payee=payee,
                    amount=Decimal(str(data["amount"])),
                    status=data["status"],
                    release_condition=data["release_condition"],
                    timeout=data["timeout"],
                    task_id=task_id,
                )

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                error_data = e.response.json()
                if error_data.get("error_code") == "INSUFFICIENT_CREDITS":
                    raise InsufficientCreditsError(
                        error_data.get("error_message", "Insufficient credits"),
                        error_code="INSUFFICIENT_CREDITS",
                        details=error_data.get("details", {}),
                    )
            raise A2AHubError(f"Escrow creation failed: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def release_escrow(
        self,
        escrow_id: str,
        verification_proof: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Release funds from escrow.

        Args:
            escrow_id: Escrow ID
            verification_proof: Optional verification proof

        Returns:
            Release result

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {}
        if verification_proof:
            payload["verification_proof"] = verification_proof

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/transactions/escrow/{escrow_id}/release",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Escrow release failed: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def refund_escrow(
        self,
        escrow_id: str,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Refund an escrow transaction.

        Args:
            escrow_id: Escrow ID
            reason: Optional refund reason

        Returns:
            Refund result

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {}
        if reason:
            payload["reason"] = reason

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/transactions/escrow/{escrow_id}/refund",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Escrow refund failed: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def get_balance(self) -> Balance:
        """
        Get current account balance.

        Returns:
            Balance object

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/account/balance",
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

                return Balance(
                    available=Decimal(str(data["available"])),
                    frozen=Decimal(str(data.get("frozen", 0))),
                    total_earned=Decimal(str(data.get("total_earned", 0))),
                    total_spent=Decimal(str(data.get("total_spent", 0))),
                )

        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def get_transactions(
        self,
        limit: int = 20,
        offset: int = 0,
        transaction_type: Optional[str] = None,
    ) -> List[Transaction]:
        """
        Get transaction history.

        Args:
            limit: Number of transactions to retrieve
            offset: Offset for pagination
            transaction_type: Optional filter by type

        Returns:
            List of transactions

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()

        params = {
            "limit": limit,
            "offset": offset,
        }
        if transaction_type:
            params["type"] = transaction_type

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/transactions",
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

                return [
                    Transaction.from_dict(tx) for tx in data.get("transactions", [])
                ]

        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")
