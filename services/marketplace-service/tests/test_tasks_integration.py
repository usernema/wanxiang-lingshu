import asyncio
from decimal import Decimal

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1 import tasks as task_routes
from app.db.database import Base, get_db
from app.main import app
from app.models.task import Task


def run(coro):
    return asyncio.run(coro)


async def create_test_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = async_session()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    return client, session, engine


async def close_test_client(client, session, engine):
    await client.aclose()
    await session.close()
    await engine.dispose()
    app.dependency_overrides.clear()


async def create_task_record(db_session, *, task_id, status="open", worker_aid=None, escrow_id=None, completed_at=None, cancelled_at=None):
    task = Task(
        task_id=task_id,
        employer_aid="agent://a2ahub/employer",
        worker_aid=worker_aid,
        title="Task title",
        description="Task description",
        requirements="none",
        reward=Decimal("10.00"),
        escrow_id=escrow_id,
        status=status,
        completed_at=completed_at,
        cancelled_at=cancelled_at,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


def test_put_open_task_updates_safe_fields():
    async def scenario():
        client, session, engine = await create_test_client()
        try:
            headers = {"X-Agent-ID": "agent://a2ahub/employer"}
            response = await client.post(
                "/api/v1/marketplace/tasks",
                json={
                    "title": "Original title",
                    "description": "Original description",
                    "requirements": "none",
                    "reward": "10.00",
                    "employer_aid": "agent://a2ahub/employer",
                },
                headers=headers,
            )
            assert response.status_code == 201
            task_id = response.json()["task_id"]

            update_response = await client.put(
                f"/api/v1/marketplace/tasks/{task_id}",
                json={"title": "Updated title", "reward": "25.50"},
                headers=headers,
            )

            assert update_response.status_code == 200
            data = update_response.json()
            assert data["title"] == "Updated title"
            assert data["reward"] == "25.50"
            assert data["status"] == "open"
        finally:
            await close_test_client(client, session, engine)

    run(scenario())



def test_put_rejects_lifecycle_fields():
    async def scenario():
        client, session, engine = await create_test_client()
        try:
            headers = {"X-Agent-ID": "agent://a2ahub/employer"}
            response = await client.post(
                "/api/v1/marketplace/tasks",
                json={
                    "title": "Original title",
                    "description": "Original description",
                    "requirements": "none",
                    "reward": "10.00",
                    "employer_aid": "agent://a2ahub/employer",
                },
                headers=headers,
            )
            task_id = response.json()["task_id"]

            update_response = await client.put(
                f"/api/v1/marketplace/tasks/{task_id}",
                json={"status": "completed", "worker_aid": "agent://a2ahub/worker"},
                headers=headers,
            )

            assert update_response.status_code == 422
        finally:
            await close_test_client(client, session, engine)

    run(scenario())



def test_put_rejects_non_employer():
    async def scenario():
        client, session, engine = await create_test_client()
        try:
            employer_headers = {"X-Agent-ID": "agent://a2ahub/employer"}
            response = await client.post(
                "/api/v1/marketplace/tasks",
                json={
                    "title": "Original title",
                    "description": "Original description",
                    "requirements": "none",
                    "reward": "10.00",
                    "employer_aid": "agent://a2ahub/employer",
                },
                headers=employer_headers,
            )
            task_id = response.json()["task_id"]

            update_response = await client.put(
                f"/api/v1/marketplace/tasks/{task_id}",
                json={"title": "Updated title"},
                headers={"X-Agent-ID": "agent://a2ahub/other"},
            )

            assert update_response.status_code == 403
            assert update_response.json()["detail"] == "Only employer can update the task"
        finally:
            await close_test_client(client, session, engine)

    run(scenario())



def test_put_rejects_non_open_task():
    async def scenario():
        client, session, engine = await create_test_client()
        try:
            task = await create_task_record(
                session,
                task_id="task_in_progress_1",
                status="in_progress",
                worker_aid="agent://a2ahub/worker",
                escrow_id="escrow_123",
            )

            update_response = await client.put(
                f"/api/v1/marketplace/tasks/{task.task_id}",
                json={"title": "Updated title"},
                headers={"X-Agent-ID": "agent://a2ahub/employer"},
            )

            assert update_response.status_code == 409
            assert update_response.json()["detail"] == "Only open tasks can be updated"
        finally:
            await close_test_client(client, session, engine)

    run(scenario())



def test_consistency_diagnostics_reports_dirty_tasks():
    async def scenario():
        client, session, engine = await create_test_client()
        try:
            await create_task_record(session, task_id="task_open_dirty", status="open", escrow_id="escrow_dirty")
            await create_task_record(session, task_id="task_completed_dirty", status="completed", completed_at=None)
            await create_task_record(session, task_id="task_cancelled_dirty", status="cancelled", cancelled_at=None)
            await create_task_record(session, task_id="task_progress_dirty", status="in_progress", worker_aid=None, escrow_id="escrow_half")

            response = await client.get("/api/v1/marketplace/tasks/diagnostics/consistency")

            assert response.status_code == 200
            data = response.json()
            assert data["summary"]["open_with_lifecycle_fields"] == 1
            assert data["summary"]["completed_missing_completed_at"] == 1
            assert data["summary"]["cancelled_missing_cancelled_at"] == 1
            assert data["summary"]["in_progress_missing_assignment"] == 1
            assert data["summary"]["total_issues"] == 4
            assert 1 <= len(data["examples"]) <= 4
        finally:
            await close_test_client(client, session, engine)

    run(scenario())



def test_consistency_diagnostics_ignores_happy_path_tasks():
    async def scenario():
        client, session, engine = await create_test_client()
        try:
            await create_task_record(session, task_id="task_open_ok", status="open")
            await create_task_record(
                session,
                task_id="task_in_progress_ok",
                status="in_progress",
                worker_aid="agent://a2ahub/worker",
                escrow_id="escrow_ok",
            )

            response = await client.get("/api/v1/marketplace/tasks/diagnostics/consistency")

            assert response.status_code == 200
            data = response.json()
            assert data["summary"]["total_issues"] == 0
            assert data["examples"] == []
        finally:
            await close_test_client(client, session, engine)

    run(scenario())



def test_cancel_open_task_does_not_call_refund(monkeypatch):
    async def scenario():
        client, session, engine = await create_test_client()
        refunded = {"called": False}

        async def fake_refund_escrow(*args, **kwargs):
            refunded["called"] = True
            return {"message": "ok"}

        monkeypatch.setattr(task_routes.CreditService, "refund_escrow", fake_refund_escrow)

        try:
            headers = {"X-Agent-ID": "agent://a2ahub/employer"}
            response = await client.post(
                "/api/v1/marketplace/tasks",
                json={
                    "title": "Cancelable task",
                    "description": "Original description",
                    "requirements": "none",
                    "reward": "10.00",
                    "employer_aid": "agent://a2ahub/employer",
                },
                headers=headers,
            )
            task_id = response.json()["task_id"]

            cancel_response = await client.post(
                f"/api/v1/marketplace/tasks/{task_id}/cancel",
                headers=headers,
            )

            assert cancel_response.status_code == 200
            assert cancel_response.json()["status"] == "cancelled"
            assert refunded["called"] is False
        finally:
            await close_test_client(client, session, engine)

    run(scenario())
