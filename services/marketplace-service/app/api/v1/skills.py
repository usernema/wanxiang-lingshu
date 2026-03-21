import logging
import uuid
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_authenticated_agent_if_present, require_agent_header
from app.db.database import get_db
from app.schemas.skill import (
    SkillCreate, SkillUpdate, SkillResponse,
    SkillPurchaseRequest, SkillReviewCreate, SkillReviewResponse
)
from app.core.config import settings
from app.services.skill_service import SkillService
from app.services.credit_service import CreditService
from app.services.matching_service import MatchingService
from app.services.storage_service import storage_service

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_error_detail(error: Exception, fallback: str = "Request failed") -> str:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.text or fallback
    return str(error) or fallback


def _build_skill_payment_metadata(skill, purchase_attempt_id: str, phase: str, extra: Optional[dict] = None) -> dict:
    metadata = {
        "resource_kind": "skill",
        "skill_id": skill.skill_id,
        "skill_name": skill.name,
        "marketplace_link": f"/marketplace?tab=skills&skill_id={skill.skill_id}&source=wallet-event",
        "purchase_attempt_id": purchase_attempt_id,
        "payment_phase": phase,
    }
    if extra:
        metadata.update(extra)
    return metadata


async def _rollback_skill_purchase_payments(
    *,
    skill,
    buyer_aid: str,
    seller_receives: float,
    treasury_aid: str,
    purchase_attempt_id: str,
    charge_transaction_id: Optional[str],
    payout_transaction_id: Optional[str],
) -> List[str]:
    rollback_failures = []

    if payout_transaction_id and seller_receives > 0:
        try:
            await CreditService.transfer(
                from_aid=skill.author_aid,
                to_aid=treasury_aid,
                amount=seller_receives,
                memo=f"Skill payout rollback: {skill.name}",
                metadata=_build_skill_payment_metadata(
                    skill,
                    purchase_attempt_id,
                    "rollback_payout",
                    {
                        "original_charge_transaction_id": charge_transaction_id,
                        "original_payout_transaction_id": payout_transaction_id,
                    },
                ),
            )
        except Exception as rollback_error:
            rollback_failures.append(f"seller payout reversal failed: {_extract_error_detail(rollback_error, 'seller payout reversal failed')}")
            logger.exception("Failed to reverse skill payout", extra={"skill_id": skill.skill_id, "purchase_attempt_id": purchase_attempt_id})

    if charge_transaction_id:
        try:
            await CreditService.transfer(
                from_aid=treasury_aid,
                to_aid=buyer_aid,
                amount=float(skill.price),
                memo=f"Skill purchase refund: {skill.name}",
                metadata=_build_skill_payment_metadata(
                    skill,
                    purchase_attempt_id,
                    "rollback_charge",
                    {
                        "original_charge_transaction_id": charge_transaction_id,
                        "original_payout_transaction_id": payout_transaction_id,
                    },
                ),
            )
        except Exception as rollback_error:
            rollback_failures.append(f"buyer refund failed: {_extract_error_detail(rollback_error, 'buyer refund failed')}")
            logger.exception("Failed to refund buyer after skill purchase failure", extra={"skill_id": skill.skill_id, "purchase_attempt_id": purchase_attempt_id})

    return rollback_failures


def _build_purchase_failure_detail(
    *,
    original_error: Exception,
    rollback_failures: List[str],
    charge_transaction_id: Optional[str],
    payout_transaction_id: Optional[str],
) -> str:
    original_detail = _extract_error_detail(original_error, "Skill purchase failed")
    if not charge_transaction_id:
        return f"Purchase failed before funds were moved: {original_detail}"
    if rollback_failures:
        return (
            "Purchase failed after funds moved and automatic rollback is incomplete: "
            f"{original_detail}. Rollback failures: {'; '.join(rollback_failures)}"
        )
    if payout_transaction_id:
        return f"Purchase failed after funds moved, but charge and payout were rolled back: {original_detail}"
    return f"Purchase failed after buyer was charged, but the charge was refunded: {original_detail}"


@router.post("/skills", response_model=SkillResponse, status_code=201)
async def create_skill(
    skill: SkillCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """发布技能"""
    actor_aid = require_agent_header(x_agent_id, x_internal_agent_token)
    if skill.author_aid != actor_aid:
        raise HTTPException(status_code=403, detail="author_aid must match authenticated agent")
    return await SkillService.create_skill(db, skill)

@router.post("/skills/{skill_id}/upload")
async def upload_skill_file(
    skill_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """上传技能文件"""
    actor_aid = require_agent_header(x_agent_id, x_internal_agent_token)
    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.author_aid != actor_aid:
        raise HTTPException(status_code=403, detail="Only skill owner can upload files")

    try:
        file_url = await storage_service.upload_file(
            file.file,
            file.filename,
            file.content_type
        )
        await SkillService.update_skill(db, skill_id, SkillUpdate(file_url=file_url))
        return {"file_url": file_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@router.get("/skills", response_model=List[SkillResponse])
async def get_skills(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    author_aid: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取技能列表"""
    return await SkillService.get_skills(db, skip, limit, category, author_aid)

@router.get("/skills/recommend")
async def recommend_skills(
    agent_aid: str,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """推荐技能"""
    actor_aid = require_agent_header(x_agent_id, x_internal_agent_token)
    if agent_aid != actor_aid:
        raise HTTPException(status_code=403, detail="agent_aid must match authenticated agent")
    return await MatchingService.recommend_skills(db, agent_aid, limit)

@router.get("/skills/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """获取技能详情"""
    viewer_aid = get_authenticated_agent_if_present(x_agent_id, x_internal_agent_token)
    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.status != "active":
        if viewer_aid != skill.author_aid:
            raise HTTPException(status_code=404, detail="Skill not found")
        return skill

    displayed_skill = await SkillService.get_skill_for_display(db, skill_id)
    if not displayed_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return displayed_skill

@router.put("/skills/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    skill_data: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """更新技能"""
    actor_aid = require_agent_header(x_agent_id, x_internal_agent_token)
    existing_skill = await SkillService.get_skill(db, skill_id)
    if not existing_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if existing_skill.author_aid != actor_aid:
        raise HTTPException(status_code=403, detail="Only skill owner can update the skill")

    skill = await SkillService.update_skill(db, skill_id, skill_data)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill

@router.post("/skills/{skill_id}/purchase")
async def purchase_skill(
    skill_id: str,
    purchase_data: SkillPurchaseRequest,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """购买技能"""
    actor_aid = require_agent_header(x_agent_id, x_internal_agent_token)
    if purchase_data.buyer_aid != actor_aid:
        raise HTTPException(status_code=403, detail="buyer_aid must match authenticated agent")

    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.status != "active":
        raise HTTPException(status_code=409, detail="Only active skills can be purchased")
    if skill.author_aid == purchase_data.buyer_aid:
        raise HTTPException(status_code=400, detail="Skill author cannot purchase own skill")
    if await SkillService.has_purchased_skill(db, skill_id, purchase_data.buyer_aid):
        raise HTTPException(status_code=409, detail="Skill has already been purchased by this buyer")

    try:
        locked_skill = await SkillService.lock_skill_for_purchase(db, skill_id, purchase_data.buyer_aid)
    except ValueError as error:
        raise HTTPException(status_code=getattr(error, "status_code", 400), detail=str(error))
    if not locked_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    skill = locked_skill

    platform_fee = float(skill.price) * settings.PLATFORM_FEE_RATE
    seller_receives = float(skill.price) - platform_fee
    treasury_aid = settings.PLATFORM_TREASURY_AID
    purchase_attempt_id = f"purchase_{uuid.uuid4().hex[:12]}"
    charge_transaction = None
    payout_transaction = None

    try:
        charge_transaction = await CreditService.transfer(
            from_aid=purchase_data.buyer_aid,
            to_aid=treasury_aid,
            amount=float(skill.price),
            memo=f"Purchase skill charge: {skill.name}",
            metadata=_build_skill_payment_metadata(skill, purchase_attempt_id, "charge"),
        )

        if seller_receives > 0:
            payout_transaction = await CreditService.transfer(
                from_aid=treasury_aid,
                to_aid=skill.author_aid,
                amount=seller_receives,
                memo=f"Skill sale payout: {skill.name}",
                metadata=_build_skill_payment_metadata(
                    skill,
                    purchase_attempt_id,
                    "payout",
                    {"original_charge_transaction_id": charge_transaction.get("transaction_id")},
                ),
            )

        await SkillService.purchase_skill(db, skill_id, purchase_data.buyer_aid, charge_transaction.get("transaction_id"))

        return {
            "skill_id": skill_id,
            "transaction_id": charge_transaction.get("transaction_id"),
            "payout_transaction_id": payout_transaction.get("transaction_id") if payout_transaction else None,
            "price": float(skill.price),
            "platform_fee": platform_fee,
            "seller_receives": seller_receives,
            "platform_treasury_aid": treasury_aid,
            "file_url": skill.file_url,
            "status": "completed"
        }
    except Exception as error:
        rollback_failures = await _rollback_skill_purchase_payments(
            skill=skill,
            buyer_aid=purchase_data.buyer_aid,
            seller_receives=seller_receives,
            treasury_aid=treasury_aid,
            purchase_attempt_id=purchase_attempt_id,
            charge_transaction_id=charge_transaction.get("transaction_id") if charge_transaction else None,
            payout_transaction_id=payout_transaction.get("transaction_id") if payout_transaction else None,
        )
        detail = _build_purchase_failure_detail(
            original_error=error,
            rollback_failures=rollback_failures,
            charge_transaction_id=charge_transaction.get("transaction_id") if charge_transaction else None,
            payout_transaction_id=payout_transaction.get("transaction_id") if payout_transaction else None,
        )
        raise HTTPException(status_code=502, detail=detail)

@router.post("/skills/{skill_id}/reviews", response_model=SkillReviewResponse, status_code=201)
async def add_review(
    skill_id: str,
    review: SkillReviewCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_agent_token: Optional[str] = Header(None, alias="X-Internal-Agent-Token"),
):
    """添加技能评价"""
    actor_aid = require_agent_header(x_agent_id, x_internal_agent_token)
    if review.reviewer_aid != actor_aid:
        raise HTTPException(status_code=403, detail="reviewer_aid must match authenticated agent")

    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.author_aid == actor_aid:
        raise HTTPException(status_code=400, detail="Skill author cannot review own skill")
    if not await SkillService.has_purchased_skill(db, skill_id, actor_aid):
        raise HTTPException(status_code=403, detail="Only verified buyers can review this skill")
    try:
        return await SkillService.add_review(db, skill_id, review)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

@router.get("/skills/{skill_id}/reviews", response_model=List[SkillReviewResponse])
async def get_reviews(skill_id: str, db: AsyncSession = Depends(get_db)):
    """获取技能评价列表"""
    return await SkillService.get_reviews(db, skill_id)
