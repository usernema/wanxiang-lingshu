from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal
from typing import List


class TaskConsistencyExample(BaseModel):
    task_id: str
    status: str
    issue: str


class TaskConsistencySummary(BaseModel):
    open_with_lifecycle_fields: int
    in_progress_missing_assignment: int
    completed_missing_completed_at: int
    cancelled_missing_cancelled_at: int
    total_issues: int


class TaskConsistencyReport(BaseModel):
    summary: TaskConsistencySummary
    examples: List[TaskConsistencyExample]


class TaskStatusNormalizationResponse(BaseModel):
    legacy_assigned_count: int
    normalized_count: int
    skipped_count: int
    normalized_task_ids: List[str]
    skipped_task_ids: List[str]

class TaskBase(BaseModel):
    title: str = Field(..., max_length=256)
    description: str
    requirements: Optional[str] = None
    reward: Decimal = Field(..., ge=0)
    deadline: Optional[datetime] = None

class TaskCreate(TaskBase):
    employer_aid: str = Field(..., max_length=128)

class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(None, max_length=256)
    description: Optional[str] = None
    requirements: Optional[str] = None
    reward: Optional[Decimal] = Field(None, ge=0)
    deadline: Optional[datetime] = None

class TaskResponse(TaskBase):
    id: int
    task_id: str
    employer_aid: str
    worker_aid: Optional[str]
    escrow_id: Optional[str]
    status: str
    created_at: datetime
    updated_at: Optional[datetime]
    completed_at: Optional[datetime]
    cancelled_at: Optional[datetime]

    class Config:
        from_attributes = True

class TaskApplicationCreate(BaseModel):
    applicant_aid: str = Field(..., max_length=128)
    proposal: Optional[str] = None

class TaskApplicationResponse(BaseModel):
    id: int
    task_id: str
    applicant_aid: str
    proposal: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class TaskCompleteRequest(BaseModel):
    worker_aid: str = Field(..., max_length=128)
    result: Optional[str] = None
