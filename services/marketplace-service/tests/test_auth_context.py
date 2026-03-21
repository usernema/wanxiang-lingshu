import asyncio
from types import SimpleNamespace

import pytest

from app.api import auth as api_auth
from app.api.v1 import skills, tasks
from app.schemas.skill import SkillCreate
from app.schemas.task import TaskCreate


def test_create_skill_rejects_mismatched_authenticated_agent():
    with pytest.raises(skills.HTTPException) as exc_info:
        asyncio.run(skills.create_skill(
            skill=SkillCreate(
                name="Python Web Development",
                description="Expert in FastAPI and Django",
                category="programming",
                price=500,
                author_aid="agent://a2ahub/other-agent",
            ),
            db=None,
            x_agent_id="agent://a2ahub/authenticated",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "author_aid must match authenticated agent"


def test_create_task_rejects_mismatched_authenticated_agent():
    with pytest.raises(tasks.HTTPException) as exc_info:
        asyncio.run(tasks.create_task(
            task=TaskCreate(
                title="Build a REST API",
                description="Need a FastAPI REST API for my project",
                requirements="Python, FastAPI, PostgreSQL",
                reward=1000,
                employer_aid="agent://a2ahub/other-agent",
            ),
            db=None,
            x_agent_id="agent://a2ahub/authenticated",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "employer_aid must match authenticated agent"


def test_recommend_skills_rejects_mismatched_authenticated_agent():
    with pytest.raises(skills.HTTPException) as exc_info:
        asyncio.run(skills.recommend_skills(
            agent_aid="agent://a2ahub/other-agent",
            limit=5,
            db=None,
            x_agent_id="agent://a2ahub/authenticated",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "agent_aid must match authenticated agent"


def test_match_tasks_rejects_mismatched_authenticated_agent():
    with pytest.raises(tasks.HTTPException) as exc_info:
        asyncio.run(tasks.match_tasks(
            agent_aid="agent://a2ahub/other-agent",
            limit=5,
            db=None,
            x_agent_id="agent://a2ahub/authenticated",
        ))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "agent_aid must match authenticated agent"


def test_create_task_requires_internal_agent_token_when_configured(monkeypatch):
    monkeypatch.setattr(api_auth.settings, "INTERNAL_AGENT_TOKEN", "secret-token")

    with pytest.raises(tasks.HTTPException) as exc_info:
        asyncio.run(tasks.create_task(
            task=TaskCreate(
                title="Build a REST API",
                description="Need a FastAPI REST API for my project",
                requirements="Python, FastAPI, PostgreSQL",
                reward=1000,
                employer_aid="agent://a2ahub/authenticated",
            ),
            db=None,
            x_agent_id="agent://a2ahub/authenticated",
            x_internal_agent_token=None,
        ))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid internal agent token"


def test_inactive_skill_owner_view_requires_internal_agent_token_when_configured(monkeypatch):
    monkeypatch.setattr(api_auth.settings, "INTERNAL_AGENT_TOKEN", "secret-token")

    async def fake_get_skill(db, skill_id):
        return SimpleNamespace(
            skill_id=skill_id,
            status="archived",
            author_aid="agent://a2ahub/authenticated",
        )

    monkeypatch.setattr(skills.SkillService, "get_skill", fake_get_skill)

    with pytest.raises(skills.HTTPException) as exc_info:
        asyncio.run(skills.get_skill(
            skill_id="skill_archived_1",
            db=None,
            x_agent_id="agent://a2ahub/authenticated",
            x_internal_agent_token=None,
        ))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid internal agent token"
