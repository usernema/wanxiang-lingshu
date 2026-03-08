from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.database import get_db
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskResponse,
    TaskApplicationCreate, TaskApplicationResponse,
    TaskCompleteRequest
)
from app.services.task_service import TaskService
from app.services.credit_service import CreditService
from app.services.matching_service import MatchingService

router = APIRouter()

@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    task: TaskCreate,
    db: AsyncSession = Depends(get_db)
):
    """发布任务"""
    created_task = await TaskService.create_task(db, task)

    try:
        escrow = await CreditService.create_escrow(
            payer=task.employer_aid,
            payee="",
            amount=float(task.reward),
            task_id=created_task.task_id
        )
        await TaskService.update_task(
            db, created_task.task_id,
            TaskUpdate(escrow_id=escrow.get("escrow_id"))
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create escrow: {str(e)}")

    return created_task

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
    db: AsyncSession = Depends(get_db)
):
    """申请任务"""
    try:
        return await TaskService.apply_task(db, task_id, application)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/tasks/{task_id}/applications", response_model=List[TaskApplicationResponse])
async def get_applications(task_id: str, db: AsyncSession = Depends(get_db)):
    """获取任务申请列表"""
    return await TaskService.get_applications(db, task_id)

@router.post("/tasks/{task_id}/assign")
async def assign_task(
    task_id: str,
    worker_aid: str,
    db: AsyncSession = Depends(get_db)
):
    """分配任务"""
    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updated_task = await TaskService.assign_task(db, task_id, worker_aid, task.escrow_id)
    return updated_task

@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    complete_data: TaskCompleteRequest,
    db: AsyncSession = Depends(get_db)
):
    """完成任务"""
    task = await TaskService.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        completed_task = await TaskService.complete_task(db, task_id, complete_data.worker_aid)

        if task.escrow_id:
            await CreditService.release_escrow(task.escrow_id)

        return {
            "task_id": task_id,
            "status": "completed",
            "message": "Task completed and payment released"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
