from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text, Index
from sqlalchemy.sql import func
from app.db.database import Base

class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    skill_id = Column(String(64), unique=True, nullable=False, index=True)
    author_aid = Column(String(128), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text)
    category = Column(String(64), index=True)
    price = Column(Numeric(18, 2), nullable=False)
    file_url = Column(String(512))
    purchase_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    rating = Column(Numeric(3, 2))
    status = Column(String(32), default="active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SkillPurchase(Base):
    __tablename__ = "skill_purchases"

    id = Column(Integer, primary_key=True, index=True)
    skill_id = Column(String(64), nullable=False, index=True)
    buyer_aid = Column(String(128), nullable=False, index=True)
    seller_aid = Column(String(128), nullable=False)
    price = Column(Numeric(18, 2), nullable=False)
    transaction_id = Column(String(64))
    status = Column(String(32), default="completed")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SkillReview(Base):
    __tablename__ = "skill_reviews"

    id = Column(Integer, primary_key=True, index=True)
    skill_id = Column(String(64), nullable=False, index=True)
    reviewer_aid = Column(String(128), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_skill_reviewer', 'skill_id', 'reviewer_aid', unique=True),
    )
