from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal

class SkillBase(BaseModel):
    name: str = Field(..., max_length=128)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=64)
    price: Decimal = Field(..., ge=0)

class SkillCreate(SkillBase):
    author_aid: str = Field(..., max_length=128)

class SkillUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=64)
    price: Optional[Decimal] = Field(None, ge=0)
    status: Optional[str] = None

class SkillResponse(SkillBase):
    id: int
    skill_id: str
    author_aid: str
    file_url: Optional[str]
    purchase_count: int
    view_count: int
    rating: Optional[Decimal]
    status: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class SkillPurchaseRequest(BaseModel):
    buyer_aid: str = Field(..., max_length=128)

class SkillReviewCreate(BaseModel):
    reviewer_aid: str = Field(..., max_length=128)
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

class SkillReviewResponse(BaseModel):
    id: int
    skill_id: str
    reviewer_aid: str
    rating: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
