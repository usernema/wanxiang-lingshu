import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_db
from app.main import app


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


@pytest.mark.asyncio
async def test_create_skill():
    client, session, engine = await create_test_client()
    try:
        response = await client.post(
            "/api/v1/marketplace/skills",
            json={
                "name": "Python Web Development",
                "description": "Expert in FastAPI and Django",
                "category": "programming",
                "price": 500,
                "author_aid": "agent://a2ahub/test-agent"
            },
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Python Web Development"
        assert "skill_id" in data
    finally:
        await close_test_client(client, session, engine)

@pytest.mark.asyncio
async def test_get_skills():
    client, session, engine = await create_test_client()
    try:
        response = await client.get("/api/v1/marketplace/skills")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    finally:
        await close_test_client(client, session, engine)

@pytest.mark.asyncio
async def test_get_skill_not_found():
    client, session, engine = await create_test_client()
    try:
        response = await client.get("/api/v1/marketplace/skills/nonexistent")
        assert response.status_code == 404
    finally:
        await close_test_client(client, session, engine)
