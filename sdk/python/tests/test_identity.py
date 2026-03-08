"""
Tests for AgentIdentity
"""

import pytest
from pathlib import Path
import tempfile
import shutil

from a2ahub.identity import AgentIdentity
from a2ahub.exceptions import AuthenticationError, ValidationError


class TestAgentIdentity:
    """Test cases for AgentIdentity class."""

    def test_create_identity(self):
        """Test creating a new identity."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
            capabilities=["code", "analysis"],
        )

        assert identity.model == "claude-opus-4-6"
        assert identity.provider == "anthropic"
        assert identity.capabilities == ["code", "analysis"]
        assert identity.private_key is not None
        assert identity.public_key is not None
        assert identity.aid is None  # Not registered yet

    def test_save_and_load_keys(self):
        """Test saving and loading keys."""
        # Create identity
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
            capabilities=["code"],
        )
        identity.aid = "agent://a2ahub/test-abc123"

        # Save to temp directory
        with tempfile.TemporaryDirectory() as tmpdir:
            identity.save_keys(tmpdir)

            # Verify files exist
            assert Path(tmpdir, "private_key.pem").exists()
            assert Path(tmpdir, "public_key.pem").exists()
            assert Path(tmpdir, "metadata.json").exists()

            # Load identity
            loaded = AgentIdentity.load_keys(tmpdir)

            assert loaded.aid == identity.aid
            assert loaded.model == identity.model
            assert loaded.provider == identity.provider
            assert loaded.capabilities == identity.capabilities

    def test_sign_message(self):
        """Test message signing."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
        )

        message = b"test message"
        signature = identity.sign_message(message)

        assert signature is not None
        assert len(signature) > 0

    def test_create_auth_header_without_aid(self):
        """Test that creating auth header without AID raises error."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
        )

        with pytest.raises(AuthenticationError):
            identity.create_auth_header()

    def test_create_auth_header_with_aid(self):
        """Test creating authentication header."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
        )
        identity.aid = "agent://a2ahub/test-abc123"

        header = identity.create_auth_header()

        assert "Authorization" in header
        assert "Agent aid=" in header["Authorization"]
        assert "signature=" in header["Authorization"]
        assert "timestamp=" in header["Authorization"]
        assert "nonce=" in header["Authorization"]

    def test_load_nonexistent_keys(self):
        """Test loading from nonexistent directory."""
        with pytest.raises(ValidationError):
            AgentIdentity.load_keys("/nonexistent/directory")


@pytest.mark.asyncio
class TestAgentIdentityAsync:
    """Async test cases for AgentIdentity."""

    async def test_register_mock(self, mocker):
        """Test registration with mocked HTTP client."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
        )

        # Mock httpx.Client
        mock_response = mocker.Mock()
        mock_response.json.return_value = {
            "aid": "agent://a2ahub/test-abc123",
            "certificate": {"test": "data"},
        }
        mock_response.raise_for_status = mocker.Mock()

        mock_client = mocker.Mock()
        mock_client.__enter__ = mocker.Mock(return_value=mock_client)
        mock_client.__exit__ = mocker.Mock(return_value=None)
        mock_client.post = mocker.Mock(return_value=mock_response)

        mocker.patch("httpx.Client", return_value=mock_client)

        # Test registration
        aid = identity.register("https://test.com/api/v1")

        assert aid == "agent://a2ahub/test-abc123"
        assert identity.aid == aid
        assert identity.certificate == {"test": "data"}
