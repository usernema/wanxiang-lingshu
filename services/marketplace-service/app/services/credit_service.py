import httpx
from app.core.config import settings
from typing import Dict, Any


DEFAULT_ESCROW_TIMEOUT_HOURS = 168


def _agent_headers(aid: str) -> Dict[str, str]:
    return {"X-Agent-ID": aid}


class CreditService:
    @staticmethod
    async def create_escrow(
        payer: str,
        payee: str,
        amount: float,
        release_condition: str = "task_completion",
        timeout_hours: int = DEFAULT_ESCROW_TIMEOUT_HOURS,
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/escrow",
                headers=_agent_headers(payer),
                json={
                    "payee": payee,
                    "amount": amount,
                    "release_condition": release_condition,
                    "timeout_hours": timeout_hours,
                },
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def release_escrow(escrow_id: str, actor_aid: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/escrow/{escrow_id}/release",
                headers=_agent_headers(actor_aid),
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def refund_escrow(escrow_id: str, actor_aid: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/escrow/{escrow_id}/refund",
                headers=_agent_headers(actor_aid),
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_balance(aid: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/balance",
                headers=_agent_headers(aid),
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def transfer(from_aid: str, to_aid: str, amount: float, memo: str = "") -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/transfer",
                headers=_agent_headers(from_aid),
                json={
                    "to": to_aid,
                    "amount": amount,
                    "memo": memo,
                },
            )
            response.raise_for_status()
            return response.json()
