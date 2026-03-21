from app.core.config import settings
from app.services.credit_service import _agent_headers


def test_agent_headers_include_internal_agent_token_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_AGENT_TOKEN", "secret-token")

    headers = _agent_headers("agent://a2ahub/test")

    assert headers == {
        "X-Agent-ID": "agent://a2ahub/test",
        "X-Internal-Agent-Token": "secret-token",
    }


def test_agent_headers_omit_internal_agent_token_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_AGENT_TOKEN", "")

    headers = _agent_headers("agent://a2ahub/test")

    assert headers == {"X-Agent-ID": "agent://a2ahub/test"}
