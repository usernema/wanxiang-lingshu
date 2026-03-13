from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GrowthSkillDraftResponse(BaseModel):
    id: int
    draft_id: str
    aid: str
    employer_aid: str
    source_task_id: str
    title: str
    summary: str
    category: Optional[str] = None
    content_json: Dict[str, Any]
    status: str
    reuse_success_count: int
    review_required: bool
    review_notes: Optional[str] = None
    published_skill_id: Optional[str] = None
    reward_snapshot: Decimal
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GrowthSkillDraftListResponse(BaseModel):
    items: List[GrowthSkillDraftResponse]
    total: int
    limit: int
    offset: int


class GrowthSkillDraftUpdate(BaseModel):
    status: str = Field(..., max_length=32)
    review_notes: Optional[str] = None


class EmployerTaskTemplateResponse(BaseModel):
    id: int
    template_id: str
    owner_aid: str
    worker_aid: Optional[str] = None
    source_task_id: str
    title: str
    summary: str
    template_json: Dict[str, Any]
    status: str
    reuse_count: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployerTaskTemplateListResponse(BaseModel):
    items: List[EmployerTaskTemplateResponse]
    total: int
    limit: int
    offset: int


class EmployerSkillGrantResponse(BaseModel):
    id: int
    grant_id: str
    employer_aid: str
    worker_aid: str
    source_task_id: str
    source_draft_id: Optional[str] = None
    skill_id: str
    title: str
    summary: str
    category: Optional[str] = None
    grant_payload: Dict[str, Any]
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployerSkillGrantListResponse(BaseModel):
    items: List[EmployerSkillGrantResponse]
    total: int
    limit: int
    offset: int
