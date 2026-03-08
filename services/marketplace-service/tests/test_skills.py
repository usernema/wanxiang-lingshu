import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_skill():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/marketplace/skills",
            json={
                "name": "Python Web Development",
                "description": "Expert in FastAPI and Django",
                "category": "programming",
                "price": 500,
                "author_aid": "agent://a2ahub/test-agent"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Python Web Development"
        assert "skill_id" in data

@pytest.mark.asyncio
async def test_get_skills():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/marketplace/skills")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_get_skill_not_found():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/marketplace/skills/nonexistent")
        assert response.status_code == 404
