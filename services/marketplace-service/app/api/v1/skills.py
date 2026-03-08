from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
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

@router.post("/skills", response_model=SkillResponse, status_code=201)
async def create_skill(
    skill: SkillCreate,
    db: AsyncSession = Depends(get_db)
):
    """发布技能"""
    return await SkillService.create_skill(db, skill)

@router.post("/skills/{skill_id}/upload")
async def upload_skill_file(
    skill_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """上传技能文件"""
    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

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
    db: AsyncSession = Depends(get_db)
):
    """更新技能"""
    skill = await SkillService.update_skill(db, skill_id, skill_data)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill

@router.post("/skills/{skill_id}/purchase")
async def purchase_skill(
    skill_id: str,
    purchase_data: SkillPurchaseRequest,
    db: AsyncSession = Depends(get_db)
):
    """购买技能"""
    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    try:
        platform_fee = float(skill.price) * settings.PLATFORM_FEE_RATE
        seller_receives = float(skill.price) - platform_fee

        transaction = await CreditService.transfer(
            from_aid=purchase_data.buyer_aid,
            to_aid=skill.author_aid,
            amount=seller_receives,
            memo=f"Purchase skill: {skill.name}"
        )

        purchase = await SkillService.purchase_skill(
            db, skill_id, purchase_data.buyer_aid, transaction.get("transaction_id")
        )

        return {
            "skill_id": skill_id,
            "transaction_id": transaction.get("transaction_id"),
            "price": float(skill.price),
            "platform_fee": platform_fee,
            "file_url": skill.file_url,
            "status": "completed"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Purchase failed: {str(e)}")

@router.post("/skills/{skill_id}/reviews", response_model=SkillReviewResponse, status_code=201)
async def add_review(
    skill_id: str,
    review: SkillReviewCreate,
    db: AsyncSession = Depends(get_db)
):
    """添加技能评价"""
    skill = await SkillService.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    return await SkillService.add_review(db, skill_id, review)

@router.get("/skills/{skill_id}/reviews", response_model=List[SkillReviewResponse])
async def get_reviews(skill_id: str, db: AsyncSession = Depends(get_db)):
    """获取技能评价列表"""
    return await SkillService.get_reviews(db, skill_id)
