import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.schemas.growth import (
    EmployerSkillGrantListResponse,
    EmployerTaskTemplateListResponse,
    GrowthExperienceCardListResponse,
    GrowthRiskMemoryListResponse,
    GrowthSkillDraftListResponse,
    GrowthSkillDraftResponse,
    GrowthSkillDraftUpdate,
)
from app.schemas.task import TaskResponse
from app.services.growth_service import GrowthService

router = APIRouter()
internal_admin_router = APIRouter()


def require_agent_header(x_agent_id: Optional[str]) -> str:
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    return x_agent_id


def require_internal_admin_token(
    x_internal_admin_token: Optional[str] = Header(None, alias="X-Internal-Admin-Token"),
):
    expected = settings.INTERNAL_ADMIN_TOKEN.strip()
    if not expected:
        return
    if not x_internal_admin_token or not secrets.compare_digest(x_internal_admin_token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal admin token")


@router.get("/agents/me/skill-drafts", response_model=GrowthSkillDraftListResponse)
async def get_my_skill_drafts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
):
    aid = require_agent_header(x_agent_id)
    items, total = await GrowthService.list_skill_drafts(db, limit=limit, offset=offset, status=status, aid=aid)
    return GrowthSkillDraftListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/agents/me/experience-cards", response_model=GrowthExperienceCardListResponse)
async def get_my_experience_cards(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    outcome_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
):
    aid = require_agent_header(x_agent_id)
    items, total = await GrowthService.list_experience_cards(
        db,
        limit=limit,
        offset=offset,
        aid=aid,
        category=category,
        outcome_status=outcome_status,
    )
    return GrowthExperienceCardListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/agents/me/risk-memories", response_model=GrowthRiskMemoryListResponse)
async def get_my_risk_memories(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    risk_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
):
    aid = require_agent_header(x_agent_id)
    items, total = await GrowthService.list_risk_memories(
        db,
        limit=limit,
        offset=offset,
        aid=aid,
        status=status,
        risk_type=risk_type,
    )
    return GrowthRiskMemoryListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/employers/me/skill-grants", response_model=EmployerSkillGrantListResponse)
async def get_my_employer_skill_grants(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
):
    owner_aid = require_agent_header(x_agent_id)
    items, total = await GrowthService.list_employer_skill_grants(
        db,
        limit=limit,
        offset=offset,
        employer_aid=owner_aid,
        status=status,
    )
    return EmployerSkillGrantListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/employers/me/templates", response_model=EmployerTaskTemplateListResponse)
async def get_my_employer_templates(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
):
    owner_aid = require_agent_header(x_agent_id)
    items, total = await GrowthService.list_employer_templates(
        db,
        limit=limit,
        offset=offset,
        owner_aid=owner_aid,
        status=status,
    )
    return EmployerTaskTemplateListResponse(items=items, total=total, limit=limit, offset=offset)


@internal_admin_router.get(
    "/internal/admin/employer-skill-grants",
    response_model=EmployerSkillGrantListResponse,
    dependencies=[Depends(require_internal_admin_token)],
)
async def list_admin_employer_skill_grants(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    owner_aid: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await GrowthService.list_employer_skill_grants(
        db,
        limit=limit,
        offset=offset,
        employer_aid=owner_aid,
        status=status,
    )
    return EmployerSkillGrantListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/employer-templates/{template_id}/create-task", response_model=TaskResponse)
async def create_task_from_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
):
    owner_aid = require_agent_header(x_agent_id)
    try:
        task = await GrowthService.create_task_from_template(db, template_id, owner_aid=owner_aid)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

    if not task:
        raise HTTPException(status_code=404, detail="Template not found")
    return task


@internal_admin_router.get(
    "/internal/admin/agent-growth/skill-drafts",
    response_model=GrowthSkillDraftListResponse,
    dependencies=[Depends(require_internal_admin_token)],
)
async def list_admin_skill_drafts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    aid: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await GrowthService.list_skill_drafts(db, limit=limit, offset=offset, status=status, aid=aid)
    return GrowthSkillDraftListResponse(items=items, total=total, limit=limit, offset=offset)


@internal_admin_router.get(
    "/internal/admin/agent-growth/experience-cards",
    response_model=GrowthExperienceCardListResponse,
    dependencies=[Depends(require_internal_admin_token)],
)
async def list_admin_experience_cards(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    aid: Optional[str] = None,
    category: Optional[str] = None,
    outcome_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await GrowthService.list_experience_cards(
        db,
        limit=limit,
        offset=offset,
        aid=aid,
        category=category,
        outcome_status=outcome_status,
    )
    return GrowthExperienceCardListResponse(items=items, total=total, limit=limit, offset=offset)


@internal_admin_router.get(
    "/internal/admin/agent-growth/risk-memories",
    response_model=GrowthRiskMemoryListResponse,
    dependencies=[Depends(require_internal_admin_token)],
)
async def list_admin_risk_memories(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    aid: Optional[str] = None,
    status: Optional[str] = None,
    risk_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await GrowthService.list_risk_memories(
        db,
        limit=limit,
        offset=offset,
        aid=aid,
        status=status,
        risk_type=risk_type,
    )
    return GrowthRiskMemoryListResponse(items=items, total=total, limit=limit, offset=offset)


@internal_admin_router.patch(
    "/internal/admin/agent-growth/skill-drafts/{draft_id}",
    response_model=GrowthSkillDraftResponse,
    dependencies=[Depends(require_internal_admin_token)],
)
async def update_admin_skill_draft(
    draft_id: str,
    payload: GrowthSkillDraftUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        draft = await GrowthService.update_skill_draft_status(
            db,
            draft_id,
            status=payload.status,
            review_notes=payload.review_notes,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    if not draft:
        raise HTTPException(status_code=404, detail="Skill draft not found")
    return draft


@internal_admin_router.get(
    "/internal/admin/employer-templates",
    response_model=EmployerTaskTemplateListResponse,
    dependencies=[Depends(require_internal_admin_token)],
)
async def list_admin_employer_templates(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    owner_aid: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await GrowthService.list_employer_templates(
        db,
        limit=limit,
        offset=offset,
        owner_aid=owner_aid,
        status=status,
    )
    return EmployerTaskTemplateListResponse(items=items, total=total, limit=limit, offset=offset)
