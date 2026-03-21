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


@pytest.mark.asyncio
async def test_get_skill_returns_created_skill():
    client, session, engine = await create_test_client()
    try:
        create_response = await client.post(
            "/api/v1/marketplace/skills",
            json={
                "name": "Acceptance Skill",
                "description": "created for route regression",
                "category": "automation",
                "price": 6,
                "author_aid": "agent://a2ahub/test-agent"
            },
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert create_response.status_code == 201
        skill_id = create_response.json()["skill_id"]

        response = await client.get(f"/api/v1/marketplace/skills/{skill_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["skill_id"] == skill_id
        assert data["view_count"] == 1
    finally:
        await close_test_client(client, session, engine)


@pytest.mark.asyncio
async def test_update_skill_does_not_increment_view_count():
    client, session, engine = await create_test_client()
    try:
        create_response = await client.post(
            "/api/v1/marketplace/skills",
            json={
                "name": "No Phantom Views",
                "description": "view count should only change on display",
                "category": "automation",
                "price": 8,
                "author_aid": "agent://a2ahub/test-agent"
            },
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert create_response.status_code == 201
        skill_id = create_response.json()["skill_id"]

        update_response = await client.put(
            f"/api/v1/marketplace/skills/{skill_id}",
            json={"description": "updated without adding views"},
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["view_count"] == 0

        display_response = await client.get(f"/api/v1/marketplace/skills/{skill_id}")
        assert display_response.status_code == 200
        assert display_response.json()["view_count"] == 1
    finally:
        await close_test_client(client, session, engine)


@pytest.mark.asyncio
async def test_get_skill_hides_inactive_skill_from_public():
    client, session, engine = await create_test_client()
    try:
        create_response = await client.post(
            "/api/v1/marketplace/skills",
            json={
                "name": "Hidden Archive",
                "description": "should not leak publicly once archived",
                "category": "automation",
                "price": 10,
                "author_aid": "agent://a2ahub/test-agent"
            },
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert create_response.status_code == 201
        skill_id = create_response.json()["skill_id"]

        archive_response = await client.put(
            f"/api/v1/marketplace/skills/{skill_id}",
            json={"status": "archived"},
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert archive_response.status_code == 200

        public_response = await client.get(f"/api/v1/marketplace/skills/{skill_id}")
        assert public_response.status_code == 404
    finally:
        await close_test_client(client, session, engine)


@pytest.mark.asyncio
async def test_get_skill_allows_owner_to_view_inactive_skill_without_incrementing_views():
    client, session, engine = await create_test_client()
    try:
        create_response = await client.post(
            "/api/v1/marketplace/skills",
            json={
                "name": "Owner Archive View",
                "description": "owner can still inspect archived skill",
                "category": "automation",
                "price": 10,
                "author_aid": "agent://a2ahub/test-agent"
            },
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert create_response.status_code == 201
        skill_id = create_response.json()["skill_id"]

        archive_response = await client.put(
            f"/api/v1/marketplace/skills/{skill_id}",
            json={"status": "archived"},
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert archive_response.status_code == 200

        owner_response = await client.get(
            f"/api/v1/marketplace/skills/{skill_id}",
            headers={"X-Agent-ID": "agent://a2ahub/test-agent"},
        )
        assert owner_response.status_code == 200
        assert owner_response.json()["status"] == "archived"
        assert owner_response.json()["view_count"] == 0
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

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return False

    async def fake_lock_skill_for_purchase(db, skill_id, buyer_aid):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_transfer(from_aid, to_aid, amount, memo="", metadata=None):
        recorded["transfers"].append({
            "from_aid": from_aid,
            "to_aid": to_aid,
            "amount": amount,
            "memo": memo,
            "metadata": metadata,
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
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)
    monkeypatch.setattr(skill_routes.SkillService, "lock_skill_for_purchase", fake_lock_skill_for_purchase)
    monkeypatch.setattr(skill_routes.CreditService, "transfer", fake_transfer)
    monkeypatch.setattr(skill_routes.SkillService, "purchase_skill", fake_purchase_skill)

    response = run(skill_routes.purchase_skill(
        skill_id="skill_123",
        purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
        db=None,
        x_agent_id="agent://a2ahub/buyer",
    ))

    treasury_aid = skill_routes.settings.PLATFORM_TREASURY_AID
    assert len(recorded["transfers"]) == 2
    assert recorded["transfers"][0]["from_aid"] == "agent://a2ahub/buyer"
    assert recorded["transfers"][0]["to_aid"] == treasury_aid
    assert recorded["transfers"][0]["amount"] == 500.0
    assert recorded["transfers"][0]["memo"] == "Purchase skill charge: Python Web Development"
    assert recorded["transfers"][0]["metadata"]["resource_kind"] == "skill"
    assert recorded["transfers"][0]["metadata"]["skill_id"] == "skill_123"
    assert recorded["transfers"][0]["metadata"]["skill_name"] == "Python Web Development"
    assert recorded["transfers"][0]["metadata"]["payment_phase"] == "charge"
    assert "purchase_attempt_id" in recorded["transfers"][0]["metadata"]

    assert recorded["transfers"][1]["from_aid"] == treasury_aid
    assert recorded["transfers"][1]["to_aid"] == "agent://a2ahub/seller"
    assert recorded["transfers"][1]["amount"] == 450.0
    assert recorded["transfers"][1]["memo"] == "Skill sale payout: Python Web Development"
    assert recorded["transfers"][1]["metadata"]["resource_kind"] == "skill"
    assert recorded["transfers"][1]["metadata"]["skill_id"] == "skill_123"
    assert recorded["transfers"][1]["metadata"]["skill_name"] == "Python Web Development"
    assert recorded["transfers"][1]["metadata"]["payment_phase"] == "payout"
    assert recorded["transfers"][1]["metadata"]["original_charge_transaction_id"] == "tx_1"
    assert recorded["transfers"][1]["metadata"]["purchase_attempt_id"] == recorded["transfers"][0]["metadata"]["purchase_attempt_id"]
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


def test_purchase_skill_refunds_buyer_when_payout_fails(monkeypatch):
    recorded = {"transfers": []}

    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return False

    async def fake_lock_skill_for_purchase(db, skill_id, buyer_aid):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_transfer(from_aid, to_aid, amount, memo="", metadata=None):
        recorded["transfers"].append({
            "from_aid": from_aid,
            "to_aid": to_aid,
            "amount": amount,
            "memo": memo,
            "metadata": metadata,
        })
        if len(recorded["transfers"]) == 1:
            return {"transaction_id": "tx_charge"}
        if len(recorded["transfers"]) == 2:
            request = skill_routes.httpx.Request("POST", "http://credit/api/v1/credits/transfer")
            response = skill_routes.httpx.Response(400, request=request, text="payout failed")
            raise skill_routes.httpx.HTTPStatusError("payout failed", request=request, response=response)
        return {"transaction_id": "tx_refund"}

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)
    monkeypatch.setattr(skill_routes.SkillService, "lock_skill_for_purchase", fake_lock_skill_for_purchase)
    monkeypatch.setattr(skill_routes.CreditService, "transfer", fake_transfer)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.purchase_skill(
            skill_id="skill_123",
            purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    treasury_aid = skill_routes.settings.PLATFORM_TREASURY_AID
    assert exc_info.value.status_code == 502
    assert "charge was refunded" in exc_info.value.detail
    assert recorded["transfers"][0]["from_aid"] == "agent://a2ahub/buyer"
    assert recorded["transfers"][0]["to_aid"] == treasury_aid
    assert recorded["transfers"][1]["from_aid"] == treasury_aid
    assert recorded["transfers"][1]["to_aid"] == "agent://a2ahub/seller"
    assert recorded["transfers"][2]["from_aid"] == treasury_aid
    assert recorded["transfers"][2]["to_aid"] == "agent://a2ahub/buyer"


def test_purchase_skill_rolls_back_payout_and_charge_when_purchase_record_fails(monkeypatch):
    recorded = {"transfers": []}

    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return False

    async def fake_lock_skill_for_purchase(db, skill_id, buyer_aid):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_transfer(from_aid, to_aid, amount, memo="", metadata=None):
        recorded["transfers"].append({
            "from_aid": from_aid,
            "to_aid": to_aid,
            "amount": amount,
            "memo": memo,
            "metadata": metadata,
        })
        return {"transaction_id": f"tx_{len(recorded['transfers'])}"}

    async def fake_purchase_skill(db, skill_id, buyer_aid, transaction_id):
        raise RuntimeError("database write failed")

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)
    monkeypatch.setattr(skill_routes.SkillService, "lock_skill_for_purchase", fake_lock_skill_for_purchase)
    monkeypatch.setattr(skill_routes.CreditService, "transfer", fake_transfer)
    monkeypatch.setattr(skill_routes.SkillService, "purchase_skill", fake_purchase_skill)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.purchase_skill(
            skill_id="skill_123",
            purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    treasury_aid = skill_routes.settings.PLATFORM_TREASURY_AID
    assert exc_info.value.status_code == 502
    assert "charge and payout were rolled back" in exc_info.value.detail
    assert recorded["transfers"] == [
        {
            "from_aid": "agent://a2ahub/buyer",
            "to_aid": treasury_aid,
            "amount": 500.0,
            "memo": "Purchase skill charge: Python Web Development",
            "metadata": recorded["transfers"][0]["metadata"],
        },
        {
            "from_aid": treasury_aid,
            "to_aid": "agent://a2ahub/seller",
            "amount": 450.0,
            "memo": "Skill sale payout: Python Web Development",
            "metadata": recorded["transfers"][1]["metadata"],
        },
        {
            "from_aid": "agent://a2ahub/seller",
            "to_aid": treasury_aid,
            "amount": 450.0,
            "memo": "Skill payout rollback: Python Web Development",
            "metadata": recorded["transfers"][2]["metadata"],
        },
        {
            "from_aid": treasury_aid,
            "to_aid": "agent://a2ahub/buyer",
            "amount": 500.0,
            "memo": "Skill purchase refund: Python Web Development",
            "metadata": recorded["transfers"][3]["metadata"],
        },
    ]


def test_purchase_skill_reports_incomplete_rollback(monkeypatch):
    recorded = {"transfers": []}

    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return False

    async def fake_lock_skill_for_purchase(db, skill_id, buyer_aid):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_transfer(from_aid, to_aid, amount, memo="", metadata=None):
        recorded["transfers"].append({
            "from_aid": from_aid,
            "to_aid": to_aid,
            "amount": amount,
            "memo": memo,
            "metadata": metadata,
        })
        if len(recorded["transfers"]) == 1:
            return {"transaction_id": "tx_charge"}
        request = skill_routes.httpx.Request("POST", "http://credit/api/v1/credits/transfer")
        response = skill_routes.httpx.Response(400, request=request, text="rollback transfer failed")
        raise skill_routes.httpx.HTTPStatusError("rollback transfer failed", request=request, response=response)

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)
    monkeypatch.setattr(skill_routes.SkillService, "lock_skill_for_purchase", fake_lock_skill_for_purchase)
    monkeypatch.setattr(skill_routes.CreditService, "transfer", fake_transfer)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.purchase_skill(
            skill_id="skill_123",
            purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    assert exc_info.value.status_code == 502
    assert "automatic rollback is incomplete" in exc_info.value.detail
    assert "buyer refund failed" in exc_info.value.detail


def test_purchase_skill_rejects_inactive_skill(monkeypatch):
    async def fake_get_skill(db, skill_id):
        skill = DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)
        skill.status = "archived"
        return skill

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.purchase_skill(
            skill_id="skill_123",
            purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Only active skills can be purchased"


def test_purchase_skill_rejects_duplicate_purchase(monkeypatch):
    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return True

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.purchase_skill(
            skill_id="skill_123",
            purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Skill has already been purchased by this buyer"


def test_purchase_skill_rechecks_duplicate_under_lock_before_charge(monkeypatch):
    recorded = {"transfer_called": False}

    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller", price=500)

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return False

    async def fake_lock_skill_for_purchase(db, skill_id, buyer_aid):
        error = ValueError("Skill has already been purchased by this buyer")
        error.status_code = 409
        raise error

    async def fake_transfer(*args, **kwargs):
        recorded["transfer_called"] = True
        return {"transaction_id": "tx_should_not_happen"}

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)
    monkeypatch.setattr(skill_routes.SkillService, "lock_skill_for_purchase", fake_lock_skill_for_purchase)
    monkeypatch.setattr(skill_routes.CreditService, "transfer", fake_transfer)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.purchase_skill(
            skill_id="skill_123",
            purchase_data=SkillPurchaseRequest(buyer_aid="agent://a2ahub/buyer"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Skill has already been purchased by this buyer"
    assert recorded["transfer_called"] is False


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


def test_add_review_rejects_duplicate_review(monkeypatch):
    async def fake_get_skill(db, skill_id):
        return DummySkill(skill_id=skill_id, author_aid="agent://a2ahub/seller")

    async def fake_has_purchased_skill(db, skill_id, buyer_aid):
        return True

    async def fake_add_review(db, skill_id, review):
        raise ValueError("Reviewer has already reviewed this skill")

    monkeypatch.setattr(skill_routes.SkillService, "get_skill", fake_get_skill)
    monkeypatch.setattr(skill_routes.SkillService, "has_purchased_skill", fake_has_purchased_skill)
    monkeypatch.setattr(skill_routes.SkillService, "add_review", fake_add_review)

    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.add_review(
            skill_id="skill_123",
            review=SkillReviewCreate(reviewer_aid="agent://a2ahub/buyer", rating=5, comment="great"),
            db=None,
            x_agent_id="agent://a2ahub/buyer",
        ))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Reviewer has already reviewed this skill"


def test_recommend_skills_requires_authenticated_agent():
    with pytest.raises(skill_routes.HTTPException) as exc_info:
        run(skill_routes.recommend_skills(
            agent_aid="agent://a2ahub/buyer",
            limit=5,
            db=None,
            x_agent_id=None,
        ))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing X-Agent-ID header"
