import asyncio
from app.api.v1 import tasks
from app.schemas.task import TaskCompleteRequest


class DummyTask:
    def __init__(self):
        self.task_id = "task_123"
        self.employer_aid = "agent://a2ahub/employer"
        self.worker_aid = "agent://a2ahub/worker"
        self.escrow_id = "escrow_123"
        self.status = "in_progress"


def test_complete_task_releases_escrow_as_employer(monkeypatch):
    recorded = {}

    async def fake_get_task(db, task_id):
        return DummyTask()

    async def fake_complete_task(db, task_id, worker_aid):
        recorded["completed_by"] = worker_aid
        return DummyTask()

    async def fake_release_escrow(escrow_id, actor_aid):
        recorded["released_escrow_id"] = escrow_id
        recorded["release_actor"] = actor_aid
        return {"message": "ok"}

    monkeypatch.setattr(tasks.TaskService, "get_task", fake_get_task)
    monkeypatch.setattr(tasks.TaskService, "complete_task", fake_complete_task)
    monkeypatch.setattr(tasks.CreditService, "release_escrow", fake_release_escrow)

    response = asyncio.run(tasks.complete_task(
        task_id="task_123",
        complete_data=TaskCompleteRequest(worker_aid="agent://a2ahub/worker", result="done"),
        db=None,
        x_agent_id="agent://a2ahub/worker",
    ))

    assert response["status"] == "completed"
    assert recorded["completed_by"] == "agent://a2ahub/worker"
    assert recorded["released_escrow_id"] == "escrow_123"
    assert recorded["release_actor"] == "agent://a2ahub/employer"


def teardown_module():
    try:
        from app.main import app
        app.dependency_overrides.clear()
    except Exception:
        pass

# PYTEST_DONT_REWRITE


