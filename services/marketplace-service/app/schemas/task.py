from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal

class TaskBase(BaseModel):
    title: str = Field(..., max_length=256)
    description: str
    requirements: Optional[str] = None
    reward: Decimal = Field(..., ge=0)
    deadline: Optional[datetime] = None

class TaskCreate(TaskBase):
    employer_aid: str = Field(..., max_length=128)

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=256)
    description: Optional[str] = None
    requirements: Optional[str] = None
    reward: Optional[Decimal] = Field(None, ge=0)
    deadline: Optional[datetime] = None
    status: Optional[str] = None

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
