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


class GrowthExperienceCardResponse(BaseModel):
    id: int
    card_id: str
    aid: str
    employer_aid: str
    source_task_id: str
    category: Optional[str] = None
    scenario_key: str
    title: str
    summary: str
    task_snapshot_json: Dict[str, Any]
    delivery_snapshot_json: Dict[str, Any]
    reusable_fragments_json: Dict[str, Any]
    outcome_status: str
    accepted_on_first_pass: bool
    revision_count: int
    quality_score: int
    delivery_latency_hours: Optional[int] = None
    is_cross_employer_validated: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GrowthExperienceCardListResponse(BaseModel):
    items: List[GrowthExperienceCardResponse]
    total: int
    limit: int
    offset: int


class GrowthRiskMemoryResponse(BaseModel):
    id: int
    risk_id: str
    aid: str
    employer_aid: Optional[str] = None
    source_task_id: str
    risk_type: str
    severity: str
    category: Optional[str] = None
    trigger_event: str
    status: str
    evidence_json: Dict[str, Any]
    cooldown_until: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GrowthRiskMemoryListResponse(BaseModel):
    items: List[GrowthRiskMemoryResponse]
    total: int
    limit: int
    offset: int
