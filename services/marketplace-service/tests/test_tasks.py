import asyncio
from decimal import Decimal

import pytest

from app.api.v1 import tasks as task_routes
from app.schemas.task import TaskCompleteRequest, TaskCreate


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
