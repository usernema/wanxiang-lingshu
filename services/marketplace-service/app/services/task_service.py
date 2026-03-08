from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.task import Task, TaskApplication
from app.schemas.task import TaskCreate, TaskUpdate, TaskApplicationCreate
from typing import List, Optional
import uuid

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
        if task.worker_aid != worker_aid:
            raise ValueError("Only assigned worker can complete the task")
        task.status = "completed"
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def get_applications(db: AsyncSession, task_id: str) -> List[TaskApplication]:
        result = await db.execute(
            select(TaskApplication).where(TaskApplication.task_id == task_id).order_by(TaskApplication.created_at.desc())
        )
        return result.scalars().all()
