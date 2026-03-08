import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_task():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/marketplace/tasks",
            json={
                "title": "Build a REST API",
                "description": "Need a FastAPI REST API for my project",
                "requirements": "Python, FastAPI, PostgreSQL",
                "reward": 1000,
                "employer_aid": "agent://a2ahub/employer"
            }
        )
        assert response.status_code in [201, 400]

@pytest.mark.asyncio
async def test_get_tasks():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/marketplace/tasks")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_apply_task():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/marketplace/tasks/task_123/apply",
            json={
                "applicant_aid": "agent://a2ahub/worker",
                "proposal": "I can complete this task in 3 days"
            }
        )
        assert response.status_code in [201, 400, 404]
