import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import httpx
import logging

from app.core.config import settings
from app.db.database import get_db
from app.schemas.task import (
    TaskConsistencyReport,
    TaskCreate, TaskUpdate, TaskResponse,
    TaskApplicationCreate, TaskApplicationResponse,
    TaskCompleteRequest,
)
from app.services.task_service import TaskService
from app.services.credit_service import CreditService
from app.services.growth_service import GrowthService
from app.services.matching_service import MatchingService

router = APIRouter()
logger = logging.getLogger(__name__)


def has_internal_admin_token(x_internal_admin_token: Optional[str]) -> bool:
    expected = settings.INTERNAL_ADMIN_TOKEN.strip()
    if not expected or not x_internal_admin_token:
        return False
    return secrets.compare_digest(x_internal_admin_token, expected)


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    task: TaskCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """发布任务"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    if task.employer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="employer_aid must match authenticated agent")

    return await TaskService.create_task(db, task)


@router.get("/tasks", response_model=List[TaskResponse])
async def get_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    employer_aid: Optional[str] = None,
    worker_aid: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取任务列表"""
    return await TaskService.get_tasks(db, skip, limit, status, employer_aid, worker_aid)


@router.get("/tasks/match")
async def match_tasks(
    agent_aid: str,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """匹配任务"""
    agent_capabilities = {}
    return await MatchingService.match_tasks(db, agent_capabilities, limit)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    """获取任务详情"""
    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    task_data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """更新任务"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")

    existing_task = await TaskService.get_task(db, task_id)
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")
    if existing_task.employer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="Only employer can update the task")

    try:
        task = await TaskService.update_task(db, task_id, task_data)
    except ValueError as e:
        raise HTTPException(status_code=getattr(e, "status_code", 400), detail=str(e))

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/tasks/diagnostics/consistency", response_model=TaskConsistencyReport)
async def diagnose_task_consistency(db: AsyncSession = Depends(get_db)):
    """诊断任务一致性"""
    return await TaskService.diagnose_task_consistency(db)


@router.post("/tasks/{task_id}/apply", response_model=TaskApplicationResponse, status_code=201)
async def apply_task(
    task_id: str,
    application: TaskApplicationCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """申请任务"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    if application.applicant_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="applicant_aid must match authenticated agent")

    try:
        return await TaskService.apply_task(db, task_id, application)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tasks/{task_id}/applications", response_model=List[TaskApplicationResponse])
async def get_applications(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID"),
    x_internal_admin_token: Optional[str] = Header(None, alias="X-Internal-Admin-Token"),
):
    """获取任务申请列表"""
    allow_all = has_internal_admin_token(x_internal_admin_token)
    if not allow_all and not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")

    try:
        return await TaskService.get_applications(
            db,
            task_id,
            viewer_aid=x_agent_id,
            allow_all=allow_all,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/tasks/{task_id}/assign", response_model=TaskResponse)
async def assign_task(
    task_id: str,
    worker_aid: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """分配任务"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")

    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.employer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="Only employer can assign the task")

    if not worker_aid:
        raise HTTPException(status_code=400, detail="worker_aid is required")
    if task.status != "open":
        raise HTTPException(status_code=409, detail="Task is not open for assignment")
    if task.worker_aid or task.escrow_id:
        raise HTTPException(status_code=409, detail="Task is already assigned")

    try:
        escrow = await CreditService.create_escrow(
            payer=task.employer_aid,
            payee=worker_aid,
            amount=float(task.reward),
            metadata={
                "resource_kind": "task",
                "task_id": task.task_id,
                "task_title": task.title,
                "marketplace_link": f"/marketplace?tab=tasks&task={task.task_id}&focus=task-workspace&source=wallet-event",
            },
        )
    except httpx.HTTPStatusError as e:
        detail = e.response.text or "Failed to create escrow"
        raise HTTPException(status_code=400, detail=detail)

    escrow_id = escrow.get("escrow_id")
    if not escrow_id:
        raise HTTPException(status_code=502, detail="Credit service did not return escrow_id")

    try:
        return await TaskService.assign_task(db, task_id, worker_aid, escrow_id)
    except ValueError as e:
        try:
            await CreditService.refund_escrow(escrow_id, task.employer_aid)
        except httpx.HTTPStatusError:
            pass
        raise HTTPException(status_code=getattr(e, "status_code", 400), detail=str(e))


@router.post("/tasks/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """取消任务"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")

    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.employer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="Only employer can cancel the task")
    if task.status not in {"open", "in_progress"}:
        if task.status == "completed":
            raise HTTPException(status_code=409, detail="Completed task cannot be cancelled")
        if task.status == "cancelled":
            raise HTTPException(status_code=409, detail="Task is already cancelled")
        raise HTTPException(status_code=409, detail=f"Task cannot be cancelled from status: {task.status}")

    if task.escrow_id:
        try:
            await CreditService.refund_escrow(task.escrow_id, task.employer_aid)
        except httpx.HTTPStatusError as e:
            detail = e.response.text or "Failed to refund escrow"
            raise HTTPException(status_code=400, detail=detail)

    try:
        return await TaskService.cancel_task(db, task_id, x_agent_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=getattr(e, "status_code", 400), detail=str(e))


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    complete_data: TaskCompleteRequest,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """提交任务结果，等待雇主验收"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    if complete_data.worker_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="worker_aid must match authenticated agent")

    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "in_progress":
        if task.status == "completed":
            raise HTTPException(status_code=409, detail="Task is already completed")
        if task.status == "cancelled":
            raise HTTPException(status_code=409, detail="Cancelled task cannot be completed")
        if task.status == "submitted":
            raise HTTPException(status_code=409, detail="Task is already awaiting employer acceptance")
        raise HTTPException(status_code=409, detail="Task is not in progress")
    if task.worker_aid != complete_data.worker_aid:
        raise HTTPException(status_code=400, detail="Only assigned worker can complete the task")
    if not task.escrow_id:
        raise HTTPException(status_code=400, detail="Task has no escrow to submit for acceptance")

    try:
        submitted_task = await TaskService.submit_task_completion(db, task_id, complete_data.worker_aid)
    except ValueError as e:
        raise HTTPException(status_code=getattr(e, "status_code", 400), detail=str(e))

    return {
        "task_id": task_id,
        "status": submitted_task.status,
        "message": "Task submitted for employer acceptance",
        "growth_assets": None,
    }


@router.post("/tasks/{task_id}/accept-completion")
async def accept_task_completion(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """雇主验收任务并释放托管"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")

    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.employer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="Only employer can accept task completion")
    if task.status != "submitted":
        if task.status == "completed":
            raise HTTPException(status_code=409, detail="Task is already completed")
        if task.status == "cancelled":
            raise HTTPException(status_code=409, detail="Cancelled task cannot be accepted")
        raise HTTPException(status_code=409, detail="Task is not awaiting employer acceptance")
    if not task.escrow_id:
        raise HTTPException(status_code=400, detail="Task has no escrow to release")

    try:
        await CreditService.release_escrow(task.escrow_id, task.employer_aid)
    except httpx.HTTPStatusError as e:
        detail = e.response.text or "Failed to release escrow"
        raise HTTPException(status_code=400, detail=detail)

    try:
        completed_task = await TaskService.accept_task_completion(db, task_id, x_agent_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=getattr(e, "status_code", 400), detail=str(e))

    growth_assets = None
    try:
        draft, template, grant = await GrowthService.create_growth_assets_for_task(db, completed_task)
        if draft or template or grant:
            growth_assets = {
                "skill_draft_id": draft.draft_id if draft else None,
                "employer_template_id": template.template_id if template else None,
                "employer_skill_grant_id": grant.grant_id if grant else None,
                "published_skill_id": draft.published_skill_id if draft else None,
                "auto_published": bool(grant and draft and draft.published_skill_id),
            }
    except Exception:
        logger.exception("Failed to create growth assets after task acceptance")

    if growth_assets and growth_assets.get("employer_skill_grant_id"):
        message = "Task accepted, payment released, first-success skill auto-published, and employer gift granted"
    elif growth_assets and growth_assets.get("published_skill_id"):
        message = "Task accepted, payment released, and skill auto-published"
    elif growth_assets:
        message = "Task accepted, payment released, and growth assets generated"
    else:
        message = "Task accepted and payment released"

    return {
        "task_id": task_id,
        "status": "completed",
        "message": message,
        "growth_assets": growth_assets,
    }


@router.post("/tasks/{task_id}/request-revision", response_model=TaskResponse)
async def request_task_revision(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """雇主将任务退回执行中"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")

    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.employer_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="Only employer can request revision")

    try:
        revised_task = await TaskService.request_task_revision(db, task_id, x_agent_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=getattr(e, "status_code", 400), detail=str(e))

    if not revised_task:
        raise HTTPException(status_code=404, detail="Task not found")
    return revised_task
