from datetime import datetime, timezone
import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task, TaskApplication
from app.schemas.task import TaskApplicationCreate, TaskCreate, TaskUpdate


class TaskService:
    @staticmethod
    async def create_task(db: AsyncSession, task_data: TaskCreate) -> Task:
        task = Task(
            task_id=f"task_{uuid.uuid4().hex[:12]}",
            **task_data.model_dump()
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def get_tasks(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        employer_aid: Optional[str] = None
    ) -> List[Task]:
        query = select(Task)
        if status:
            query = query.where(Task.status == status)
        if employer_aid:
            query = query.where(Task.employer_aid == employer_aid)
        query = query.offset(skip).limit(limit).order_by(Task.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_task(db: AsyncSession, task_id: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update_task(db: AsyncSession, task_id: str, task_data: TaskUpdate) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        for key, value in task_data.model_dump(exclude_unset=True).items():
            setattr(task, key, value)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def apply_task(db: AsyncSession, task_id: str, application_data: TaskApplicationCreate) -> TaskApplication:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError("Task not found")
        if task.status != "open":
            raise ValueError("Task is not open for applications")

        application = TaskApplication(task_id=task_id, **application_data.model_dump())
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return application

    @staticmethod
    async def assign_task(db: AsyncSession, task_id: str, worker_aid: str, escrow_id: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        if not worker_aid:
            raise ValueError("worker_aid is required")
        if task.status != "open":
            raise ValueError("Task is not open for assignment")
        if task.worker_aid or task.escrow_id:
            raise ValueError("Task is already assigned")

        task.worker_aid = worker_aid
        task.escrow_id = escrow_id
        task.status = "in_progress"
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def complete_task(db: AsyncSession, task_id: str, worker_aid: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        if task.status != "in_progress":
            raise ValueError("Task is not in progress")
        if task.worker_aid != worker_aid:
            raise ValueError("Only assigned worker can complete the task")
        if not task.escrow_id:
            raise ValueError("Task has no escrow to release")

        task.status = "completed"
        task.completed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def cancel_task(db: AsyncSession, task_id: str, actor_aid: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        if task.employer_aid != actor_aid:
            raise PermissionError("Only employer can cancel the task")
        if task.status not in {"open", "in_progress"}:
            if task.status == "completed":
                raise ValueError("Completed task cannot be cancelled")
            if task.status == "cancelled":
                raise ValueError("Task is already cancelled")
            raise ValueError(f"Task cannot be cancelled from status: {task.status}")

        task.status = "cancelled"
        task.cancelled_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def get_applications(db: AsyncSession, task_id: str) -> List[TaskApplication]:
        result = await db.execute(
            select(TaskApplication).where(TaskApplication.task_id == task_id).order_by(TaskApplication.created_at.desc())
        )
        return result.scalars().all()
