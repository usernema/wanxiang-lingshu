from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.config import settings
from app.db.database import get_db
from app.schemas.skill import (
    SkillCreate, SkillUpdate, SkillResponse,
    SkillPurchaseRequest, SkillReviewCreate, SkillReviewResponse
)
from app.services.skill_service import SkillService
from app.services.credit_service import CreditService
from app.services.matching_service import MatchingService
from app.services.storage_service import storage_service
from app.core.config import settings

router = APIRouter()


def require_agent_header(x_agent_id: Optional[str]) -> str:
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    return x_agent_id

@router.post("/skills", response_model=SkillResponse, status_code=201)
async def create_skill(
    skill: SkillCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """发布技能"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    if skill.author_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="author_aid must match authenticated agent")
    return await SkillService.create_skill(db, skill)

@router.post("/skills/{skill_id}/upload")
async def upload_skill_file(
    skill_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """上传技能文件"""
    actor_aid = require_agent_header(x_agent_id)
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
    db: AsyncSession = Depends(get_db)
):
    """推荐技能"""
    return await MatchingService.recommend_skills(db, agent_aid, limit)

@router.get("/skills/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    """获取技能详情"""
    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill

@router.put("/skills/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    skill_data: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """更新技能"""
    actor_aid = require_agent_header(x_agent_id)
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
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """购买技能"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    if purchase_data.buyer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="buyer_aid must match authenticated agent")

    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.author_aid == purchase_data.buyer_aid:
        raise HTTPException(status_code=400, detail="Skill author cannot purchase own skill")

    try:
        platform_fee = float(skill.price) * settings.PLATFORM_FEE_RATE
        seller_receives = float(skill.price) - platform_fee
        treasury_aid = settings.PLATFORM_TREASURY_AID

        charge_transaction = await CreditService.transfer(
            from_aid=purchase_data.buyer_aid,
            to_aid=treasury_aid,
            amount=float(skill.price),
            memo=f"Purchase skill charge: {skill.name}",
            metadata={
                "resource_kind": "skill",
                "skill_id": skill.skill_id,
                "skill_name": skill.name,
                "marketplace_link": f"/marketplace?tab=skills&skill_id={skill.skill_id}&source=wallet-event",
            },
        )

        payout_transaction = None
        if seller_receives > 0:
            payout_transaction = await CreditService.transfer(
                from_aid=treasury_aid,
                to_aid=skill.author_aid,
                amount=seller_receives,
                memo=f"Skill sale payout: {skill.name}",
                metadata={
                    "resource_kind": "skill",
                    "skill_id": skill.skill_id,
                    "skill_name": skill.name,
                    "marketplace_link": f"/marketplace?tab=skills&skill_id={skill.skill_id}&source=wallet-event",
                },
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Purchase failed: {str(e)}")

@router.post("/skills/{skill_id}/reviews", response_model=SkillReviewResponse, status_code=201)
async def add_review(
    skill_id: str,
    review: SkillReviewCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """添加技能评价"""
    actor_aid = require_agent_header(x_agent_id)
    if review.reviewer_aid != actor_aid:
        raise HTTPException(status_code=403, detail="reviewer_aid must match authenticated agent")

    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.author_aid == actor_aid:
        raise HTTPException(status_code=400, detail="Skill author cannot review own skill")
    if not await SkillService.has_purchased_skill(db, skill_id, actor_aid):
        raise HTTPException(status_code=403, detail="Only verified buyers can review this skill")

    return await SkillService.add_review(db, skill_id, review)

@router.get("/skills/{skill_id}/reviews", response_model=List[SkillReviewResponse])
async def get_reviews(skill_id: str, db: AsyncSession = Depends(get_db)):
    """获取技能评价列表"""
    return await SkillService.get_reviews(db, skill_id)
