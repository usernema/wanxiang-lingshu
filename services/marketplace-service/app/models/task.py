from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text, Index
from sqlalchemy.sql import func
from app.db.database import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, nullable=False, index=True)
    employer_aid = Column(String(128), nullable=False, index=True)
    worker_aid = Column(String(128), index=True)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=False)
    requirements = Column(Text)
    reward = Column(Numeric(18, 2), nullable=False)
    escrow_id = Column(String(64))
    status = Column(String(32), default="open", index=True)
    deadline = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True))

class TaskApplication(Base):
    __tablename__ = "task_applications"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), nullable=False, index=True)
    applicant_aid = Column(String(128), nullable=False, index=True)
    proposal = Column(Text)
    status = Column(String(32), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_task_applicant', 'task_id', 'applicant_aid', unique=True),
    )
