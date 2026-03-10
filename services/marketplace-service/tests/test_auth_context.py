import asyncio

import pytest

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
