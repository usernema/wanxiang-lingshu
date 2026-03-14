from datetime import datetime, timezone
import uuid
from typing import List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task, TaskApplication
from app.schemas.task import (
    TaskApplicationCreate,
    TaskConsistencyExample,
    TaskConsistencyReport,
    TaskConsistencySummary,
    TaskCreate,
    TaskUpdate,
)


class TaskService:
    UPDATABLE_FIELDS = {"title", "description", "requirements", "reward", "deadline"}
    DIAGNOSTIC_SAMPLE_LIMIT = 10

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
    def _conflict_error(detail: str) -> ValueError:
        error = ValueError(detail)
        setattr(error, "status_code", 409)
        return error

    @classmethod
    def _validation_error(cls, detail: str) -> ValueError:
        error = ValueError(detail)
        setattr(error, "status_code", 400)
        return error

    @classmethod
    def _raise_invalid_update(cls, detail: str) -> None:
        raise cls._validation_error(detail)

    @classmethod
    def _raise_conflict(cls, detail: str) -> None:
        raise cls._conflict_error(detail)

    @classmethod
    def _get_safe_update_fields(cls, task_data: TaskUpdate) -> dict:
        updates = task_data.model_dump(exclude_unset=True)
        disallowed_fields = set(updates) - cls.UPDATABLE_FIELDS
        if disallowed_fields:
            cls._raise_invalid_update(
                f"Unsupported task update fields: {', '.join(sorted(disallowed_fields))}"
            )
        return updates

    @staticmethod
    def _build_issue(task: Task) -> Optional[str]:
        if task.status == "open" and (task.worker_aid or task.escrow_id):
            return "open task should not have worker_aid or escrow_id"
        if task.status in {"assigned", "in_progress", "submitted"} and (not task.worker_aid or not task.escrow_id):
            return f"{task.status} task must have worker_aid and escrow_id"
        if task.status == "completed" and not task.completed_at:
            return "completed task must have completed_at"
        if task.status == "cancelled" and not task.cancelled_at:
            return "cancelled task must have cancelled_at"
        return None

    @classmethod
    async def diagnose_task_consistency(cls, db: AsyncSession) -> TaskConsistencyReport:
        result = await db.execute(
            select(Task).where(
                or_(
                    (Task.status == "open") & (or_(Task.worker_aid.is_not(None), Task.escrow_id.is_not(None))),
                    (Task.status.in_(("assigned", "in_progress", "submitted"))) & (or_(Task.worker_aid.is_(None), Task.escrow_id.is_(None))),
                    (Task.status == "completed") & (Task.completed_at.is_(None)),
                    (Task.status == "cancelled") & (Task.cancelled_at.is_(None)),
                )
            ).order_by(Task.created_at.desc())
        )
        tasks = result.scalars().all()

        summary = TaskConsistencySummary(
            open_with_lifecycle_fields=0,
            in_progress_missing_assignment=0,
            completed_missing_completed_at=0,
            cancelled_missing_cancelled_at=0,
            total_issues=0,
        )
        examples = []

        for task in tasks:
            issue = cls._build_issue(task)
            if not issue:
                continue
            summary.total_issues += 1
            if task.status == "open":
                summary.open_with_lifecycle_fields += 1
            elif task.status in {"assigned", "in_progress", "submitted"}:
                summary.in_progress_missing_assignment += 1
            elif task.status == "completed":
                summary.completed_missing_completed_at += 1
            elif task.status == "cancelled":
                summary.cancelled_missing_cancelled_at += 1

            if len(examples) < cls.DIAGNOSTIC_SAMPLE_LIMIT:
                examples.append(
                    TaskConsistencyExample(
                        task_id=task.task_id,
                        status=task.status,
                        issue=issue,
                    )
                )

        return TaskConsistencyReport(summary=summary, examples=examples)

    @staticmethod
    async def get_tasks(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        employer_aid: Optional[str] = None,
        worker_aid: Optional[str] = None,
    ) -> List[Task]:
        query = select(Task)
        if status:
            query = query.where(Task.status == status)
        if employer_aid:
            query = query.where(Task.employer_aid == employer_aid)
        if worker_aid:
            query = query.where(Task.worker_aid == worker_aid)
        query = query.offset(skip).limit(limit).order_by(Task.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_task(db: AsyncSession, task_id: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        return result.scalar_one_or_none()

    @classmethod
    async def update_task(cls, db: AsyncSession, task_id: str, task_data: TaskUpdate) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None

        if task.status != "open":
            cls._raise_conflict("Only open tasks can be updated")

        updates = cls._get_safe_update_fields(task_data)
        for key, value in updates.items():
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
        if task.employer_aid == application_data.applicant_aid:
            raise ValueError("Employer cannot apply to own task")

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
            raise TaskService._conflict_error("Task is not open for assignment")
        if task.worker_aid or task.escrow_id:
            raise TaskService._conflict_error("Task is already assigned")

        applications_result = await db.execute(
            select(TaskApplication)
            .where(TaskApplication.task_id == task_id)
            .order_by(TaskApplication.created_at.asc())
        )
        applications = applications_result.scalars().all()
        selected_application = next(
            (application for application in applications if application.applicant_aid == worker_aid),
            None,
        )
        if not selected_application:
            raise TaskService._validation_error("Assigned worker must have an application for this task")

        for application in applications:
            application.status = "accepted" if application.applicant_aid == worker_aid else "rejected"

        task.worker_aid = worker_aid
        task.escrow_id = escrow_id
        task.status = "in_progress"
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def submit_task_completion(db: AsyncSession, task_id: str, worker_aid: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        if task.status not in {"assigned", "in_progress"}:
            if task.status == "completed":
                raise TaskService._conflict_error("Task is already completed")
            if task.status == "cancelled":
                raise TaskService._conflict_error("Cancelled task cannot be completed")
            if task.status == "submitted":
                raise TaskService._conflict_error("Task is already awaiting employer acceptance")
            raise TaskService._conflict_error("Task is not in progress")
        if task.worker_aid != worker_aid:
            raise TaskService._validation_error("Only assigned worker can complete the task")
        if not task.escrow_id:
            raise TaskService._validation_error("Task has no escrow to submit for acceptance")

        task.status = "submitted"
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def accept_task_completion(db: AsyncSession, task_id: str, actor_aid: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        if task.employer_aid != actor_aid:
            raise PermissionError("Only employer can accept task completion")
        if task.status != "submitted":
            if task.status == "completed":
                raise TaskService._conflict_error("Task is already completed")
            if task.status == "cancelled":
                raise TaskService._conflict_error("Cancelled task cannot be accepted")
            raise TaskService._conflict_error("Task is not awaiting employer acceptance")
        if not task.escrow_id:
            raise TaskService._validation_error("Task has no escrow to release")

        task.status = "completed"
        task.completed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def request_task_revision(db: AsyncSession, task_id: str, actor_aid: str) -> Optional[Task]:
        result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return None
        if task.employer_aid != actor_aid:
            raise PermissionError("Only employer can request revision")
        if task.status != "submitted":
            if task.status == "completed":
                raise TaskService._conflict_error("Completed task cannot be reopened for revision")
            if task.status == "cancelled":
                raise TaskService._conflict_error("Cancelled task cannot be revised")
            raise TaskService._conflict_error("Task is not awaiting employer acceptance")

        task.status = "in_progress"
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
        if task.status not in {"open", "assigned", "in_progress"}:
            if task.status == "completed":
                raise TaskService._conflict_error("Completed task cannot be cancelled")
            if task.status == "cancelled":
                raise TaskService._conflict_error("Task is already cancelled")
            raise TaskService._conflict_error(f"Task cannot be cancelled from status: {task.status}")

        task.status = "cancelled"
        task.cancelled_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def get_applications(
        db: AsyncSession,
        task_id: str,
        *,
        viewer_aid: Optional[str] = None,
        allow_all: bool = False,
    ) -> List[TaskApplication]:
        task_result = await db.execute(select(Task).where(Task.task_id == task_id))
        task = task_result.scalar_one_or_none()
        if not task:
            raise ValueError("Task not found")

        query = select(TaskApplication).where(TaskApplication.task_id == task_id).order_by(TaskApplication.created_at.desc())
        if allow_all or viewer_aid == task.employer_aid:
            result = await db.execute(query)
            return result.scalars().all()

        if not viewer_aid:
            raise PermissionError("Only employer or applicant can view task applications")

        result = await db.execute(query.where(TaskApplication.applicant_aid == viewer_aid))
        applications = result.scalars().all()
        if applications:
            return applications

        raise PermissionError("Only employer or applicant can view task applications")
