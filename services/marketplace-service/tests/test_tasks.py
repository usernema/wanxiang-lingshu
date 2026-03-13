import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1 import tasks as task_routes
from app.db.database import Base
from app.models.task import Task
from app.schemas.task import TaskCompleteRequest, TaskCreate, TaskUpdate
from app.services.task_service import TaskService


class DummyTask:
    def __init__(
        self,
        *,
        task_id="task_123",
        employer_aid="agent://a2ahub/employer",
        worker_aid=None,
        escrow_id=None,
        status="open",
        reward=Decimal("10"),
        completed_at=None,
        cancelled_at=None,
    ):
        self.id = 1
        self.task_id = task_id
        self.title = "Task title"
        self.description = "Task description"
        self.requirements = None
        self.reward = reward
        self.deadline = None
        self.employer_aid = employer_aid
        self.worker_aid = worker_aid
        self.escrow_id = escrow_id
        self.status = status
        self.created_at = None
        self.updated_at = None
        self.completed_at = completed_at
        self.cancelled_at = cancelled_at


def run(coro):
    return asyncio.run(coro)


def test_create_task_returns_open_without_escrow(monkeypatch):
    recorded = {"create_called": False, "escrow_called": False}

    async def fake_create_task(db, task_data):
        recorded["create_called"] = True
        return DummyTask(employer_aid=task_data.employer_aid, reward=task_data.reward)

    async def fake_create_escrow(*args, **kwargs):
        recorded["escrow_called"] = True
        return {"escrow_id": "escrow_should_not_exist"}

    monkeypatch.setattr(task_routes.TaskService, "create_task", fake_create_task)
    monkeypatch.setattr(task_routes.CreditService, "create_escrow", fake_create_escrow)

    response = run(task_routes.create_task(
        task=TaskCreate(
            title="Build a REST API",
            description="Need a FastAPI REST API for my project",
            requirements="Python, FastAPI, PostgreSQL",
            reward=Decimal("1000"),
            employer_aid="agent://a2ahub/employer",
        ),
        db=None,
        x_agent_id="agent://a2ahub/employer",
    ))

    assert recorded["create_called"] is True
    assert recorded["escrow_called"] is False
    assert response.status == "open"
    assert response.escrow_id is None


def test_update_task_requires_actor_header(monkeypatch):
    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id)

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.update_task(
            task_id="task_123",
            task_data=TaskUpdate(title="Updated title"),
            db=None,
            x_agent_id=None,
        ))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing X-Agent-ID header"


def test_update_task_rejects_non_employer(monkeypatch):
    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, employer_aid="agent://a2ahub/employer")

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.update_task(
            task_id="task_123",
            task_data=TaskUpdate(title="Updated title"),
            db=None,
            x_agent_id="agent://a2ahub/other",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Only employer can update the task"


def test_update_task_allows_employer_to_edit_open_task(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, employer_aid="agent://a2ahub/employer", status="open")

    async def fake_update_task(db, task_id, task_data):
        recorded["payload"] = task_data.model_dump(exclude_unset=True)
        return DummyTask(task_id=task_id, employer_aid="agent://a2ahub/employer", status="open", reward=Decimal("42"))

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.TaskService, "update_task", fake_update_task)

    response = run(task_routes.update_task(
        task_id="task_123",
        task_data=TaskUpdate(title="Updated title", reward=Decimal("42")),
        db=None,
        x_agent_id="agent://a2ahub/employer",
    ))

    assert recorded["payload"] == {"title": "Updated title", "reward": Decimal("42")}
    assert response.status == "open"
    assert response.reward == Decimal("42")


@pytest.mark.parametrize("status", ["in_progress", "completed", "cancelled"])
def test_update_task_rejects_non_open_task(monkeypatch, status):
    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, employer_aid="agent://a2ahub/employer", status=status)

    async def fake_update_task(db, task_id, task_data):
        error = ValueError("Only open tasks can be updated")
        error.status_code = 409
        raise error

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.TaskService, "update_task", fake_update_task)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.update_task(
            task_id="task_123",
            task_data=TaskUpdate(title="Updated title"),
            db=None,
            x_agent_id="agent://a2ahub/employer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Only open tasks can be updated"


def test_task_update_schema_rejects_lifecycle_fields():
    with pytest.raises(ValidationError):
        TaskUpdate(status="completed")
    with pytest.raises(ValidationError):
        TaskUpdate(worker_aid="agent://a2ahub/worker")
    with pytest.raises(ValidationError):
        TaskUpdate(escrow_id="escrow_123")
    with pytest.raises(ValidationError):
        TaskUpdate(completed_at=datetime.now(timezone.utc))
    with pytest.raises(ValidationError):
        TaskUpdate(cancelled_at=datetime.now(timezone.utc))


def test_assign_endpoint_creates_escrow_and_sets_in_progress(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, status="open", reward=Decimal("10"))

    async def fake_create_escrow(payer, payee, amount, release_condition="task_completion", timeout_hours=168):
        recorded["create"] = {
            "payer": payer,
            "payee": payee,
            "amount": amount,
            "release_condition": release_condition,
            "timeout_hours": timeout_hours,
        }
        return {"escrow_id": "escrow_123"}

    async def fake_assign_task(db, task_id, worker_aid, escrow_id):
        recorded["assign"] = {
            "task_id": task_id,
            "worker_aid": worker_aid,
            "escrow_id": escrow_id,
        }
        return DummyTask(task_id=task_id, worker_aid=worker_aid, escrow_id=escrow_id, status="in_progress")

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "create_escrow", fake_create_escrow)
    monkeypatch.setattr(task_routes.TaskService, "assign_task", fake_assign_task)

    response = run(task_routes.assign_task(
        task_id="task_123",
        worker_aid="agent://a2ahub/worker",
        db=None,
        x_agent_id="agent://a2ahub/employer",
    ))

    assert recorded["create"] == {
        "payer": "agent://a2ahub/employer",
        "payee": "agent://a2ahub/worker",
        "amount": 10.0,
        "release_condition": "task_completion",
        "timeout_hours": 168,
    }
    assert recorded["assign"] == {
        "task_id": "task_123",
        "worker_aid": "agent://a2ahub/worker",
        "escrow_id": "escrow_123",
    }
    assert response.status == "in_progress"
    assert response.escrow_id == "escrow_123"
    assert response.worker_aid == "agent://a2ahub/worker"


def test_assign_endpoint_refunds_escrow_when_task_update_fails(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, status="open", reward=Decimal("10"))

    async def fake_create_escrow(payer, payee, amount, release_condition="task_completion", timeout_hours=168):
        recorded["create"] = {
            "payer": payer,
            "payee": payee,
            "amount": amount,
        }
        return {"escrow_id": "escrow_123"}

    async def fake_assign_task(db, task_id, worker_aid, escrow_id):
        raise ValueError("database write failed")

    async def fake_refund_escrow(escrow_id, actor_aid):
        recorded["refund"] = {"escrow_id": escrow_id, "actor_aid": actor_aid}
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "create_escrow", fake_create_escrow)
    monkeypatch.setattr(task_routes.TaskService, "assign_task", fake_assign_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.assign_task(
            task_id="task_123",
            worker_aid="agent://a2ahub/worker",
            db=None,
            x_agent_id="agent://a2ahub/employer",
        ))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "database write failed"
    assert recorded["refund"] == {
        "escrow_id": "escrow_123",
        "actor_aid": "agent://a2ahub/employer",
    }


def test_cancel_endpoint_cancels_open_task_without_refund(monkeypatch):
    recorded = {"refunded": False}

    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, status="open", escrow_id=None)

    async def fake_refund_escrow(escrow_id, actor_aid):
        recorded["refunded"] = True
        return {"message": "ok"}

    async def fake_cancel_task(db, task_id, actor_aid):
        recorded["cancelled"] = {"task_id": task_id, "actor_aid": actor_aid}
        return DummyTask(task_id=task_id, status="cancelled", employer_aid=actor_aid)

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)
    monkeypatch.setattr(task_routes.TaskService, "cancel_task", fake_cancel_task)

    response = run(task_routes.cancel_task(
        task_id="task_123",
        db=None,
        x_agent_id="agent://a2ahub/employer",
    ))

    assert recorded["refunded"] is False
    assert recorded["cancelled"] == {
        "task_id": "task_123",
        "actor_aid": "agent://a2ahub/employer",
    }
    assert response.status == "cancelled"


def test_cancel_endpoint_refunds_then_cancels_in_progress_task(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_refund_escrow(escrow_id, actor_aid):
        recorded["refunded"] = {"escrow_id": escrow_id, "actor_aid": actor_aid}
        return {"message": "ok"}

    async def fake_cancel_task(db, task_id, actor_aid):
        recorded["cancelled"] = {"task_id": task_id, "actor_aid": actor_aid}
        return DummyTask(
            task_id=task_id,
            employer_aid=actor_aid,
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="cancelled",
            cancelled_at="now",
        )

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)
    monkeypatch.setattr(task_routes.TaskService, "cancel_task", fake_cancel_task)

    response = run(task_routes.cancel_task(
        task_id="task_123",
        db=None,
        x_agent_id="agent://a2ahub/employer",
    ))

    assert recorded["refunded"] == {
        "escrow_id": "escrow_123",
        "actor_aid": "agent://a2ahub/employer",
    }
    assert recorded["cancelled"] == {
        "task_id": "task_123",
        "actor_aid": "agent://a2ahub/employer",
    }
    assert response.status == "cancelled"
    assert response.cancelled_at == "now"


def test_cancel_endpoint_does_not_advance_when_refund_fails(monkeypatch):
    recorded = {"cancelled": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_refund_escrow(escrow_id, actor_aid):
        request = task_routes.httpx.Request("POST", f"http://credit/api/v1/credits/escrow/{escrow_id}/refund")
        response = task_routes.httpx.Response(400, request=request, text="refund failed")
        raise task_routes.httpx.HTTPStatusError("refund failed", request=request, response=response)

    async def fake_cancel_task(db, task_id, actor_aid):
        recorded["cancelled"] = True
        return DummyTask(task_id=task_id, status="cancelled", employer_aid=actor_aid)

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)
    monkeypatch.setattr(task_routes.TaskService, "cancel_task", fake_cancel_task)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.cancel_task(
            task_id="task_123",
            db=None,
            x_agent_id="agent://a2ahub/employer",
        ))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "refund failed"
    assert recorded["cancelled"] is False


def test_cancel_endpoint_rejects_non_employer_before_refund(monkeypatch):
    recorded = {"refunded": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_refund_escrow(escrow_id, actor_aid):
        recorded["refunded"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.cancel_task(
            task_id="task_123",
            db=None,
            x_agent_id="agent://a2ahub/other",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Only employer can cancel the task"
    assert recorded["refunded"] is False


def test_cancel_endpoint_rejects_completed_task_before_refund(monkeypatch):
    recorded = {"refunded": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="completed",
        )

    async def fake_refund_escrow(escrow_id, actor_aid):
        recorded["refunded"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.cancel_task(
            task_id="task_123",
            db=None,
            x_agent_id="agent://a2ahub/employer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Completed task cannot be cancelled"
    assert recorded["refunded"] is False


def test_cancel_endpoint_rejects_duplicate_cancel_without_refund(monkeypatch):
    recorded = {"refunded": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="cancelled",
            cancelled_at="now",
        )

    async def fake_refund_escrow(escrow_id, actor_aid):
        recorded["refunded"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.cancel_task(
            task_id="task_123",
            db=None,
            x_agent_id="agent://a2ahub/employer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Task is already cancelled"
    assert recorded["refunded"] is False


def test_complete_endpoint_releases_then_completes(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released"] = {"escrow_id": escrow_id, "actor_aid": actor_aid}
        return {"message": "ok"}

    async def fake_complete_task(db, task_id, worker_aid):
        recorded["completed"] = {"task_id": task_id, "worker_aid": worker_aid}
        return DummyTask(task_id=task_id, worker_aid=worker_aid, escrow_id="escrow_123", status="completed")

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)
    monkeypatch.setattr(task_routes.TaskService, "complete_task", fake_complete_task)

    response = run(task_routes.complete_task(
        task_id="task_123",
        complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
        db=None,
        x_agent_id="agent://a2ahub/worker",
    ))

    assert recorded["released"] == {
        "escrow_id": "escrow_123",
        "actor_aid": "agent://a2ahub/employer",
    }
    assert recorded["completed"] == {
        "task_id": "task_123",
        "worker_aid": "agent://a2ahub/worker",
    }
    assert response["status"] == "completed"


def test_complete_endpoint_returns_growth_asset_ids_when_created(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released"] = {"escrow_id": escrow_id, "actor_aid": actor_aid}
        return {"message": "ok"}

    async def fake_complete_task(db, task_id, worker_aid):
        recorded["completed"] = {"task_id": task_id, "worker_aid": worker_aid}
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid=worker_aid,
            escrow_id="escrow_123",
            status="completed",
            completed_at="now",
        )

    async def fake_create_growth_assets_for_task(db, task, result):
        recorded["growth"] = {"task_id": task.task_id, "result": result}
        draft = type("Draft", (), {"draft_id": "draft_123", "published_skill_id": "skill_123"})()
        template = type("Template", (), {"template_id": "tmpl_123"})()
        grant = type("Grant", (), {"grant_id": "grant_123"})()
        return draft, template, grant

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)
    monkeypatch.setattr(task_routes.TaskService, "complete_task", fake_complete_task)
    monkeypatch.setattr(task_routes.GrowthService, "create_growth_assets_for_task", fake_create_growth_assets_for_task)

    response = run(task_routes.complete_task(
        task_id="task_123",
        complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="structured summary"),
        db=None,
        x_agent_id="agent://a2ahub/worker",
    ))

    assert response["status"] == "completed"
    assert response["growth_assets"] == {
        "skill_draft_id": "draft_123",
        "employer_template_id": "tmpl_123",
        "employer_skill_grant_id": "grant_123",
        "published_skill_id": "skill_123",
        "auto_published": True,
    }
    assert "employer gift granted" in response["message"]
    assert recorded["growth"] == {"task_id": "task_123", "result": "structured summary"}


def test_complete_endpoint_swallows_growth_asset_failures(monkeypatch):
    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        return {"message": "ok"}

    async def fake_complete_task(db, task_id, worker_aid):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid=worker_aid,
            escrow_id="escrow_123",
            status="completed",
            completed_at="now",
        )

    async def fake_create_growth_assets_for_task(db, task, result):
        raise RuntimeError("growth service down")

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)
    monkeypatch.setattr(task_routes.TaskService, "complete_task", fake_complete_task)
    monkeypatch.setattr(task_routes.GrowthService, "create_growth_assets_for_task", fake_create_growth_assets_for_task)

    response = run(task_routes.complete_task(
        task_id="task_123",
        complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
        db=None,
        x_agent_id="agent://a2ahub/worker",
    ))

    assert response["status"] == "completed"
    assert response["growth_assets"] is None
    assert response["message"] == "Task completed and payment released"


def test_complete_endpoint_does_not_advance_when_release_fails(monkeypatch):
    recorded = {"completed": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        request = task_routes.httpx.Request("POST", f"http://credit/api/v1/credits/escrow/{escrow_id}/release")
        response = task_routes.httpx.Response(400, request=request, text="release failed")
        raise task_routes.httpx.HTTPStatusError("release failed", request=request, response=response)

    async def fake_complete_task(db, task_id, worker_aid):
        recorded["completed"] = True
        return DummyTask(task_id=task_id, worker_aid=worker_aid, escrow_id="escrow_123", status="completed")

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)
    monkeypatch.setattr(task_routes.TaskService, "complete_task", fake_complete_task)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.complete_task(
            task_id="task_123",
            complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
            db=None,
            x_agent_id="agent://a2ahub/worker",
        ))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "release failed"
    assert recorded["completed"] is False


def test_complete_endpoint_rejects_wrong_worker_before_release(monkeypatch):
    recorded = {"released": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="in_progress",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.complete_task(
            task_id="task_123",
            complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/other-worker", result="done"),
            db=None,
            x_agent_id="agent://a2ahub/other-worker",
        ))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Only assigned worker can complete the task"
    assert recorded["released"] is False


def test_complete_endpoint_rejects_duplicate_complete_without_release(monkeypatch):
    recorded = {"released": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="completed",
            completed_at="now",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.complete_task(
            task_id="task_123",
            complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
            db=None,
            x_agent_id="agent://a2ahub/worker",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Task is already completed"
    assert recorded["released"] is False


def test_complete_endpoint_rejects_cancelled_task_without_release(monkeypatch):
    recorded = {"released": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status="cancelled",
            cancelled_at="now",
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.complete_task(
            task_id="task_123",
            complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
            db=None,
            x_agent_id="agent://a2ahub/worker",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Cancelled task cannot be completed"
    assert recorded["released"] is False


def test_diagnose_task_consistency_returns_summary_and_examples(monkeypatch):
    report = {
        "summary": {
            "open_with_lifecycle_fields": 1,
            "in_progress_missing_assignment": 0,
            "completed_missing_completed_at": 1,
            "cancelled_missing_cancelled_at": 0,
            "total_issues": 2,
        },
        "examples": [
            {"task_id": "task_open_dirty", "status": "open", "issue": "open task should not have worker_aid or escrow_id"},
            {"task_id": "task_completed_dirty", "status": "completed", "issue": "completed task must have completed_at"},
        ],
    }

    async def fake_diagnose_task_consistency(db):
        return report

    monkeypatch.setattr(task_routes.TaskService, "diagnose_task_consistency", fake_diagnose_task_consistency)

    response = run(task_routes.diagnose_task_consistency(db=None))

    assert response == report
    assert response["summary"]["total_issues"] == 2
    assert len(response["examples"]) == 2


def test_assign_endpoint_rejects_non_open_task_before_creating_escrow(monkeypatch):
    recorded = {"escrow_called": False}

    async def fake_get_task(db, task_id):
        return DummyTask(task_id=task_id, status="completed", worker_aid="agent://a2ahub/worker", escrow_id="escrow_123")

    async def fake_create_escrow(*args, **kwargs):
        recorded["escrow_called"] = True
        return {"escrow_id": "escrow_should_not_exist"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "create_escrow", fake_create_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.assign_task(
            task_id="task_123",
            worker_aid="agent://a2ahub/worker",
            db=None,
            x_agent_id="agent://a2ahub/employer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Task is not open for assignment"
    assert recorded["escrow_called"] is False


@pytest.mark.parametrize(
    ("status", "expected_detail"),
    [
        ("completed", "Task is already completed"),
        ("cancelled", "Cancelled task cannot be completed"),
        ("open", "Task is not in progress"),
    ],
)
def test_complete_endpoint_preserves_status_conflict_messages(monkeypatch, status, expected_detail):
    recorded = {"released": False}

    async def fake_get_task(db, task_id):
        return DummyTask(
            task_id=task_id,
            employer_aid="agent://a2ahub/employer",
            worker_aid="agent://a2ahub/worker",
            escrow_id="escrow_123",
            status=status,
            completed_at="now" if status == "completed" else None,
            cancelled_at="now" if status == "cancelled" else None,
        )

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released"] = True
        return {"message": "ok"}

    monkeypatch.setattr(task_routes.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(task_routes.CreditService, "release_escrow", fake_release_escrow)

    with pytest.raises(task_routes.HTTPException) as exc_info:
        run(task_routes.complete_task(
            task_id="task_123",
            complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
            db=None,
            x_agent_id="agent://a2ahub/worker",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == expected_detail
    assert recorded["released"] is False


def test_diagnose_task_consistency_aggregates_all_issue_categories():
    async def scenario():
        async with create_test_db_session() as db:
            dirty_tasks = [
                Task(
                    task_id="task_open_dirty",
                    employer_aid="agent://a2ahub/employer",
                    worker_aid="agent://a2ahub/worker",
                    escrow_id="escrow_123",
                    title="open dirty",
                    description="open dirty",
                    reward=Decimal("10"),
                    status="open",
                ),
                Task(
                    task_id="task_in_progress_dirty",
                    employer_aid="agent://a2ahub/employer",
                    worker_aid=None,
                    escrow_id=None,
                    title="in progress dirty",
                    description="in progress dirty",
                    reward=Decimal("10"),
                    status="in_progress",
                ),
                Task(
                    task_id="task_completed_dirty",
                    employer_aid="agent://a2ahub/employer",
                    worker_aid="agent://a2ahub/worker",
                    escrow_id="escrow_234",
                    title="completed dirty",
                    description="completed dirty",
                    reward=Decimal("10"),
                    status="completed",
                    completed_at=None,
                ),
                Task(
                    task_id="task_cancelled_dirty",
                    employer_aid="agent://a2ahub/employer",
                    worker_aid="agent://a2ahub/worker",
                    escrow_id="escrow_345",
                    title="cancelled dirty",
                    description="cancelled dirty",
                    reward=Decimal("10"),
                    status="cancelled",
                    cancelled_at=None,
                ),
                Task(
                    task_id="task_clean",
                    employer_aid="agent://a2ahub/employer",
                    worker_aid=None,
                    escrow_id=None,
                    title="clean task",
                    description="clean task",
                    reward=Decimal("10"),
                    status="open",
                ),
            ]
            db.add_all(dirty_tasks)
            await db.commit()

            report = await TaskService.diagnose_task_consistency(db)

            assert report.summary.open_with_lifecycle_fields == 1
            assert report.summary.in_progress_missing_assignment == 1
            assert report.summary.completed_missing_completed_at == 1
            assert report.summary.cancelled_missing_cancelled_at == 1
            assert report.summary.total_issues == 4
            assert {example.task_id for example in report.examples} == {
                "task_open_dirty",
                "task_in_progress_dirty",
                "task_completed_dirty",
                "task_cancelled_dirty",
            }
            assert all(example.task_id != "task_clean" for example in report.examples)

    run(scenario())


def test_diagnose_task_consistency_limits_examples_to_sample_limit():
    async def scenario():
        async with create_test_db_session() as db:
            for index in range(TaskService.DIAGNOSTIC_SAMPLE_LIMIT + 3):
                db.add(Task(
                    task_id=f"task_dirty_{index}",
                    employer_aid="agent://a2ahub/employer",
                    worker_aid="agent://a2ahub/worker",
                    escrow_id="escrow_123",
                    title=f"dirty {index}",
                    description="dirty",
                    reward=Decimal("10"),
                    status="open",
                ))
            await db.commit()

            report = await TaskService.diagnose_task_consistency(db)

            assert report.summary.total_issues == TaskService.DIAGNOSTIC_SAMPLE_LIMIT + 3
            assert len(report.examples) == TaskService.DIAGNOSTIC_SAMPLE_LIMIT

    run(scenario())


@asynccontextmanager
async def create_test_db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as session:
            yield session
    finally:
        await engine.dispose()


def test_task_service_build_issue_returns_expected_messages():
    assert TaskService._build_issue(DummyTask(status="open", worker_aid="agent://a2ahub/worker", escrow_id=None)) == "open task should not have worker_aid or escrow_id"
    assert TaskService._build_issue(DummyTask(status="in_progress", worker_aid=None, escrow_id=None)) == "in_progress task must have worker_aid and escrow_id"
    assert TaskService._build_issue(DummyTask(status="completed", worker_aid="agent://a2ahub/worker", escrow_id="escrow_123", completed_at=None)) == "completed task must have completed_at"
    assert TaskService._build_issue(DummyTask(status="cancelled", worker_aid="agent://a2ahub/worker", escrow_id="escrow_123", cancelled_at=None)) == "cancelled task must have cancelled_at"
    assert TaskService._build_issue(DummyTask(status="open", worker_aid=None, escrow_id=None)) is None


def test_task_service_conflict_error_sets_status_code():
    error = TaskService._conflict_error("Task is already assigned")

    assert isinstance(error, ValueError)
    assert str(error) == "Task is already assigned"
    assert getattr(error, "status_code") == 409


def test_task_service_validation_error_sets_status_code():
    error = TaskService._validation_error("Task has no escrow to release")

    assert isinstance(error, ValueError)
    assert str(error) == "Task has no escrow to release"
    assert getattr(error, "status_code") == 400


def teardown_module():
    try:
        from app.main import app
        app.dependency_overrides.clear()
    except Exception:
        pass

# PYTEST_DONT_REWRITE





























































































































# PYTEST_DONT_REWRITE


def teardown_module():
    try:
        from app.main import app
        app.dependency_overrides.clear()
    except Exception:
        pass

# PYTEST_DONT_REWRITE






























































































































# PYTEST_DONT_REWRITE


def teardown_module():
    try:
        from app.main import app
        app.dependency_overrides.clear()
    except Exception:
        pass

# PYTEST_DONT_REWRITE






























































































































# PYTEST_DONT_REWRITE


def teardown_module():
    try:
        from app.main import app
        app.dependency_overrides.clear()
    except Exception:
        pass

# PYTEST_DONT_REWRITE










































































































# PYTEST_DONT_REWRITE


def teardown_module():
    try:
        from app.main import app
        app.dependency_overrides.clear()
    except Exception:
        pass

# PYTEST_DONT_REWRITE










































































































# PYTEST_DONT_REWRITE
