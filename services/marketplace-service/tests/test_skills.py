import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1 import skills as skill_routes
from app.db.database import Base, get_db
from app.main import app
from app.schemas.skill import SkillPurchaseRequest, SkillReviewCreate, SkillUpdate


class DummySkill:
    def __init__(
        self,
        *,
        skill_id="skill_123",
        author_aid="agent://a2ahub/author",
        name="Python Web Development",
        price=500,
        file_url=None,
    ):
        self.id = 1
        self.skill_id = skill_id
        self.author_aid = author_aid
        self.name = name
        self.description = "desc"
        self.category = "programming"
        self.price = price
        self.file_url = file_url
        self.purchase_count = 0
        self.view_count = 0
        self.rating = None
        self.status = "active"
        self.created_at = None
        self.updated_at = None


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


def test_update_skill_requires_owner(monkeypatch):
    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/author")

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.update_skill(
            skill_id="skill_123",
            skill_data=SkillUpdate(name="Updated"),
            db=None,
            x_agent_id="agent://a2ahub/other",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Only skill owner can update the skill"


def test_purchase_skill_charges_full_amount_then_pays_seller(monkeypatch):
    recorded = {"transfers": []}

    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_transfer(from_aid, to_aid, amount, memo=""):
        recorded["transfers"].append({
            "from_aid": from_aid,
            "to_aid": to_aid,
            "amount": amount,
            "memo": memo,
        })
        return {"transaction_id": f"tx_{len(recorded['transfers'])}"}

    async def fake_purchase_skill(db, skill_id, buyer_aid, transaction_id):
        recorded["purchase"] = {
            "skill_id": skill_id,
            "buyer_aid": buyer_aid,
            "transaction_id": transaction_id,
        }
        return object()

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.CreditService, "transfer", fake_transfer)
    monkeypatch.setattr(skill_routes.SkillService, "purchase_skill", fake_purchase_skill)

    response = run(skill_routes.purchase_skill(
        skill_id="skill_123",
        purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
        db=None,
        x_agent_id="agent://a2ahub/buyer",
    ))

    treasury_aid = skill_routes.settings.PLATFORM_TREASURY_AID
    assert recorded["transfers"] == [
        {
            "from_aid": "agent://a2ahub/buyer",
            "to_aid": treasury_aid,
            "amount": 500.0,
            "memo": "Purchase skill charge: Python Web Development",
        },
        {
            "from_aid": treasury_aid,
            "to_aid": "agent://a2ahub/seller",
            "amount": 450.0,
            "memo": "Skill sale payout: Python Web Development",
        },
    ]
    assert recorded["purchase"] == {
        "skill_id": "skill_123",
        "buyer_aid": "agent://a2ahub/buyer",
        "transaction_id": "tx_1",
    }
    assert response["transaction_id"] == "tx_1"
    assert response["payout_transaction_id"] == "tx_2"
    assert response["price"] == 500.0
    assert response["platform_fee"] == 50.0
    assert response["seller_receives"] == 450.0


def test_add_review_requires_verified_purchase(monkeypatch):
    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller")

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return False

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.add_review(
            skill_id="skill_123",
            review=SkillReviewCreate(reviewer_aid="agent://a2ahub/buyer", rating=5, comment="great"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Only verified buyers can review this skill"
