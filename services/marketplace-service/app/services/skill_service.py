from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.skill import Skill, SkillPurchase, SkillReview
from app.schemas.skill import SkillCreate, SkillUpdate, SkillReviewCreate
from typing import List, Optional
import uuid

class SkillService:
    @staticmethod
    def _conflict_error(detail: str) -> ValueError:
        error = ValueError(detail)
        setattr(error, "status_code", 409)
        return error

    @staticmethod
    def _validation_error(detail: str) -> ValueError:
        error = ValueError(detail)
        setattr(error, "status_code", 400)
        return error

    @staticmethod
    async def create_skill(db: AsyncSession, skill_data: SkillCreate) -> Skill:
        skill = Skill(
            skill_id=f"skill_{uuid.uuid4().hex[:12]}",
            **skill_data.model_dump()
        )
        db.add(skill)
        await db.commit()
        await db.refresh(skill)
        return skill

    @staticmethod
    async def get_skills(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 20,
        category: Optional[str] = None,
        author_aid: Optional[str] = None
    ) -> List[Skill]:
        query = select(Skill).where(Skill.status == "active")
        if category:
            query = query.where(Skill.category == category)
        if author_aid:
            query = query.where(Skill.author_aid == author_aid)
        query = query.offset(skip).limit(limit).order_by(Skill.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_skill(db: AsyncSession, skill_id: str) -> Optional[Skill]:
        result = await db.execute(select(Skill).where(Skill.skill_id == skill_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_skill_for_display(db: AsyncSession, skill_id: str) -> Optional[Skill]:
        result = await db.execute(select(Skill).where(Skill.skill_id == skill_id))
        skill = result.scalar_one_or_none()
        if skill:
            skill.view_count += 1
            await db.commit()
            await db.refresh(skill)
        return skill

    @staticmethod
    async def update_skill(db: AsyncSession, skill_id: str, skill_data: SkillUpdate) -> Optional[Skill]:
        result = await db.execute(select(Skill).where(Skill.skill_id == skill_id))
        skill = result.scalar_one_or_none()
        if not skill:
            return None
        for key, value in skill_data.model_dump(exclude_unset=True).items():
            setattr(skill, key, value)
        await db.commit()
        await db.refresh(skill)
        return skill

    @classmethod
    async def lock_skill_for_purchase(cls, db: AsyncSession, skill_id: str, buyer_aid: str) -> Optional[Skill]:
        result = await db.execute(
            select(Skill).where(Skill.skill_id == skill_id).with_for_update()
        )
        skill = result.scalar_one_or_none()
        if not skill:
            return None
        if skill.status != "active":
            raise cls._conflict_error("Only active skills can be purchased")
        if skill.author_aid == buyer_aid:
            raise cls._validation_error("Skill author cannot purchase own skill")
        if await cls.has_purchased_skill(db, skill_id, buyer_aid):
            raise cls._conflict_error("Skill has already been purchased by this buyer")
        return skill

    @staticmethod
    async def purchase_skill(db: AsyncSession, skill_id: str, buyer_aid: str, transaction_id: str) -> SkillPurchase:
        result = await db.execute(select(Skill).where(Skill.skill_id == skill_id))
        skill = result.scalar_one_or_none()
        if not skill:
            raise ValueError("Skill not found")
        if skill.status != "active":
            raise SkillService._conflict_error("Only active skills can be purchased")

        existing_purchase = await db.execute(
            select(SkillPurchase.id).where(
                SkillPurchase.skill_id == skill_id,
                SkillPurchase.buyer_aid == buyer_aid,
                SkillPurchase.status == "completed",
            )
        )
        if existing_purchase.scalar_one_or_none() is not None:
            raise SkillService._conflict_error("Skill has already been purchased by this buyer")

        purchase = SkillPurchase(
            skill_id=skill_id,
            buyer_aid=buyer_aid,
            seller_aid=skill.author_aid,
            price=skill.price,
            transaction_id=transaction_id
        )
        db.add(purchase)
        skill.purchase_count += 1
        try:
            await db.commit()
        except IntegrityError as error:
            await db.rollback()
            raise SkillService._conflict_error("Skill has already been purchased by this buyer") from error
        await db.refresh(purchase)
        return purchase

    @staticmethod
    async def has_purchased_skill(db: AsyncSession, skill_id: str, buyer_aid: str) -> bool:
        result = await db.execute(
            select(SkillPurchase.id).where(
                SkillPurchase.skill_id == skill_id,
                SkillPurchase.buyer_aid == buyer_aid,
                SkillPurchase.status == "completed",
            )
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def add_review(db: AsyncSession, skill_id: str, review_data: SkillReviewCreate) -> SkillReview:
        existing_review = await db.execute(
            select(SkillReview.id).where(
                SkillReview.skill_id == skill_id,
                SkillReview.reviewer_aid == review_data.reviewer_aid,
            )
        )
        if existing_review.scalar_one_or_none() is not None:
            raise SkillService._conflict_error("Reviewer has already reviewed this skill")

        review = SkillReview(skill_id=skill_id, **review_data.model_dump())
        db.add(review)
        try:
            await db.commit()
        except IntegrityError as error:
            await db.rollback()
            raise SkillService._conflict_error("Reviewer has already reviewed this skill") from error

        result = await db.execute(select(func.avg(SkillReview.rating)).where(SkillReview.skill_id == skill_id))
        avg_rating = result.scalar()

        skill_result = await db.execute(select(Skill).where(Skill.skill_id == skill_id))
        skill = skill_result.scalar_one_or_none()
        if skill:
            skill.rating = avg_rating
            await db.commit()

        await db.refresh(review)
        return review

    @staticmethod
    async def get_reviews(db: AsyncSession, skill_id: str) -> List[SkillReview]:
        result = await db.execute(
            select(SkillReview).where(SkillReview.skill_id == skill_id).order_by(SkillReview.created_at.desc())
        )
        return result.scalars().all()
