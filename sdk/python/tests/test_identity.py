"""
Tests for AgentIdentity
"""

import pytest
from pathlib import Path
import tempfile
from unittest.mock import Mock

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
        assert identity.binding_key is None

    def test_save_and_load_keys(self):
        """Test saving and loading keys."""
        # Create identity
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
            capabilities=["code"],
        )
        identity.aid = "agent://a2ahub/test-abc123"
        identity.binding_key = "bind_test_abc123"

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
            assert loaded.binding_key == identity.binding_key
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

    async def test_register_mock(self, monkeypatch):
        """Test registration with mocked HTTP client."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
        )

        # Mock httpx.Client
        mock_response = Mock()
        mock_response.json.return_value = {
            "aid": "agent://a2ahub/test-abc123",
            "binding_key": "bind_test_abc123",
            "certificate": {"test": "data"},
        }
        mock_response.raise_for_status = Mock()

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post = Mock(return_value=mock_response)

        monkeypatch.setattr("httpx.Client", lambda *args, **kwargs: mock_client)

        # Test registration
        aid = identity.register("https://test.com/api/v1")

        assert aid == "agent://a2ahub/test-abc123"
        assert identity.aid == aid
        assert identity.binding_key == "bind_test_abc123"
        assert identity.certificate == {"test": "data"}

    async def test_login_and_fetch_mission(self, monkeypatch):
        """Test challenge/login/mission flow with mocked HTTP client."""
        identity = AgentIdentity.create(
            model="openclaw",
            provider="openclaw",
        )
        identity.aid = "agent://a2ahub/test-openclaw"

        challenge_response = Mock()
        challenge_response.json.return_value = {
            "aid": identity.aid,
            "nonce": "nonce-123",
            "timestamp": 1742083200,
            "message": "{\"aid\":\"agent://a2ahub/test-openclaw\",\"nonce\":\"nonce-123\",\"timestamp\":1742083200}",
        }
        challenge_response.raise_for_status = Mock()

        login_response = Mock()
        login_response.json.return_value = {
            "token": "token-abc",
            "expires_at": "2026-03-16T12:00:00Z",
            "mission": {
                "summary": "继续系统主线",
                "steps": [{"key": "complete_profile", "title": "补齐代理命牌"}],
            },
        }
        login_response.raise_for_status = Mock()

        mission_response = Mock()
        mission_response.json.return_value = {
            "summary": "继续系统主线",
            "steps": [{"key": "complete_profile", "title": "补齐代理命牌"}],
        }
        mission_response.raise_for_status = Mock()

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post = Mock(side_effect=[challenge_response, login_response])
        mock_client.get = Mock(return_value=mission_response)

        monkeypatch.setattr("httpx.Client", lambda *args, **kwargs: mock_client)

        token = identity.login("https://test.com/api/v1")
        mission = identity.fetch_mission("https://test.com/api/v1", auto_login=False)

        assert token == "token-abc"
        assert identity.access_token == "token-abc"
        assert identity.token_expires_at == "2026-03-16T12:00:00Z"
        assert identity.mission["summary"] == "继续系统主线"
        assert mission["steps"][0]["key"] == "complete_profile"

    async def test_advance_autopilot(self, monkeypatch):
        """Test autopilot advance flow with mocked HTTP client."""
        identity = AgentIdentity.create(
            model="openclaw",
            provider="openclaw",
        )
        identity.aid = "agent://a2ahub/test-openclaw"
        identity.access_token = "token-abc"

        autopilot_response = Mock()
        autopilot_response.json.return_value = {
            "aid": identity.aid,
            "applied": [
                {
                    "step_key": "complete_profile",
                    "kind": "profile_bootstrap",
                    "status": "applied",
                    "summary": "已自动补齐默认命牌资料。",
                }
            ],
            "mission": {
                "summary": "进入训练场完成当前诊断。",
                "steps": [{"key": "complete-dojo-diagnostic", "title": "完成当前诊断"}],
            },
            "diagnostic": {
                "question_set": {"set_id": "dojo_automation_ops_diagnostic_v1"},
                "questions": [{"question_id": "q1"}, {"question_id": "q2"}],
            },
        }
        autopilot_response.raise_for_status = Mock()

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=None)
        mock_client.post = Mock(return_value=autopilot_response)

        monkeypatch.setattr("httpx.Client", lambda *args, **kwargs: mock_client)

        payload = identity.advance_autopilot("https://test.com/api/v1", auto_login=False)

        assert payload["applied"][0]["kind"] == "profile_bootstrap"
        assert payload["diagnostic"]["question_set"]["set_id"] == "dojo_automation_ops_diagnostic_v1"
        assert identity.mission["steps"][0]["key"] == "complete-dojo-diagnostic"
