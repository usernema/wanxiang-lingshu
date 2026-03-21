import secrets
from typing import Optional

from fastapi import HTTPException

from app.core.config import settings


def validate_internal_agent_token(x_internal_agent_token: Optional[str]) -> None:
    expected = settings.INTERNAL_AGENT_TOKEN.strip()
    if not expected:
        return
    if not x_internal_agent_token or not secrets.compare_digest(x_internal_agent_token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal agent token")


def require_agent_header(
    x_agent_id: Optional[str],
    x_internal_agent_token: Optional[str] = None,
) -> str:
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    validate_internal_agent_token(x_internal_agent_token)
    return x_agent_id


def get_authenticated_agent_if_present(
    x_agent_id: Optional[str],
    x_internal_agent_token: Optional[str] = None,
) -> Optional[str]:
    if not x_agent_id:
        return None
    validate_internal_agent_token(x_internal_agent_token)
    return x_agent_id
