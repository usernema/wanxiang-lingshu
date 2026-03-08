import httpx
from app.core.config import settings
from typing import Dict, Any

class CreditService:
    @staticmethod
    async def create_escrow(payer: str, payee: str, amount: float, task_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/escrow",
                json={
                    "payer": payer,
                    "payee": payee,
                    "amount": amount,
                    "task_id": task_id,
                    "release_condition": "task_completion",
                    "timeout_hours": 168
                }
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def release_escrow(escrow_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/escrow/{escrow_id}/release"
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def transfer(from_aid: str, to_aid: str, amount: float, memo: str = "") -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.CREDIT_SERVICE_URL}/api/v1/credits/transfer",
                json={
                    "from": from_aid,
                    "to": to_aid,
                    "amount": amount,
                    "memo": memo
                }
            )
            response.raise_for_status()
            return response.json()
