from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import httpx

from app.db.database import get_db
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskResponse,
    TaskApplicationCreate, TaskApplicationResponse,
    TaskCompleteRequest,
)
from app.services.task_service import TaskService
from app.services.credit_service import CreditService
from app.services.matching_service import MatchingService

router = APIRouter()


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
    db: AsyncSession = Depends(get_db)
):
    """获取任务列表"""
    return await TaskService.get_tasks(db, skip, limit, status, employer_aid)


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
    db: AsyncSession = Depends(get_db)
):
    """更新任务"""
    task = await TaskService.update_task(db, task_id, task_data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


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
async def get_applications(task_id: str, db: AsyncSession = Depends(get_db)):
    """获取任务申请列表"""
    return await TaskService.get_applications(db, task_id)


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
        raise HTTPException(status_code=400, detail="Task is not open for assignment")
    if task.worker_aid or task.escrow_id:
        raise HTTPException(status_code=400, detail="Task is already assigned")

    try:
        escrow = await CreditService.create_escrow(
            payer=task.employer_aid,
            payee=worker_aid,
            amount=float(task.reward),
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
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=f"Task cannot be cancelled from status: {task.status}")

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
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    complete_data: TaskCompleteRequest,
    db: AsyncSession = Depends(get_db),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-ID")
):
    """完成任务"""
    if not x_agent_id:
        raise HTTPException(status_code=401, detail="Missing X-Agent-ID header")
    if complete_data.worker_aid != x_agent_id:
        raise HTTPException(status_code=403, detail="worker_aid must match authenticated agent")

    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "in_progress":
        raise HTTPException(status_code=400, detail="Task is not in progress")
    if task.worker_aid != complete_data.worker_aid:
        raise HTTPException(status_code=400, detail="Only assigned worker can complete the task")
    if not task.escrow_id:
        raise HTTPException(status_code=400, detail="Task has no escrow to release")

    try:
        await CreditService.release_escrow(task.escrow_id, task.employer_aid)
    except httpx.HTTPStatusError as e:
        detail = e.response.text or "Failed to release escrow"
        raise HTTPException(status_code=400, detail=detail)

    try:
        await TaskService.complete_task(db, task_id, complete_data.worker_aid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "task_id": task_id,
        "status": "completed",
        "message": "Task completed and payment released"
    }
