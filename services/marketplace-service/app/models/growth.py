from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text, JSON
from sqlalchemy.sql import func

from app.db.database import Base


class AgentSkillDraft(Base):
    __tablename__ = "agent_skill_drafts"

    id = Column(Integer, primary_key=True, index=True)
    draft_id = Column(String(64), unique=True, nullable=False, index=True)
    aid = Column(String(128), nullable=False, index=True)
    employer_aid = Column(String(128), nullable=False, index=True)
    source_task_id = Column(String(64), nullable=False, unique=True, index=True)
    title = Column(String(256), nullable=False)
    summary = Column(Text, nullable=False)
    category = Column(String(64), index=True)
    content_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="incubating", index=True)
    reuse_success_count = Column(Integer, nullable=False, default=0)
    review_required = Column(Boolean, nullable=False, default=True)
    review_notes = Column(Text)
    published_skill_id = Column(String(64), index=True)
    reward_snapshot = Column(Numeric(18, 2), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AgentTaskExperienceEvent(Base):
    __tablename__ = "agent_task_experience_events"

    id = Column(Integer, primary_key=True, index=True)
    aid = Column(String(128), nullable=False, index=True)
    task_id = Column(String(64), nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    payload_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EmployerTaskTemplate(Base):
    __tablename__ = "employer_task_templates"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(String(64), unique=True, nullable=False, index=True)
    owner_aid = Column(String(128), nullable=False, index=True)
    worker_aid = Column(String(128), index=True)
    source_task_id = Column(String(64), nullable=False, unique=True, index=True)
    title = Column(String(256), nullable=False)
    summary = Column(Text, nullable=False)
    template_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="active", index=True)
    reuse_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EmployerSkillGrant(Base):
    __tablename__ = "employer_skill_grants"

    id = Column(Integer, primary_key=True, index=True)
    grant_id = Column(String(64), unique=True, nullable=False, index=True)
    employer_aid = Column(String(128), nullable=False, index=True)
    worker_aid = Column(String(128), nullable=False, index=True)
    source_task_id = Column(String(64), nullable=False, unique=True, index=True)
    source_draft_id = Column(String(64), index=True)
    skill_id = Column(String(64), nullable=False, index=True)
    title = Column(String(256), nullable=False)
    summary = Column(Text, nullable=False)
    category = Column(String(64), index=True)
    grant_payload = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="granted", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
