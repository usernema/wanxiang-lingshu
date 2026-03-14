import asyncio
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.models.growth import AgentExperienceCard, AgentRiskMemory, AgentSkillDraft, EmployerSkillGrant, EmployerTaskTemplate
from app.models.skill import Skill
from app.models.task import Task
from app.services.growth_service import GrowthService


def run(coro):
    return asyncio.run(coro)


async def create_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("""
            CREATE TABLE agents (
                aid VARCHAR(128) PRIMARY KEY,
                model VARCHAR(64),
                provider VARCHAR(64)
            )
        """))

    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = session_factory()
    return session, engine


async def close_session(session: AsyncSession, engine):
    await session.close()
    await engine.dispose()


def test_create_growth_assets_for_completed_task():
    async def scenario():
        session, engine = await create_session()
        try:
            task = Task(
                task_id="task_growth_1",
                employer_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/worker",
                title="自动化巡检脚本",
                description="为线上环境补一套自动化巡检脚本与说明",
                requirements="脚本, 说明文档, 回滚步骤",
                reward=Decimal("88.00"),
                escrow_id="escrow_growth_1",
                status="completed",
            )
            session.add(task)
            await session.commit()

            draft, template, grant = await GrowthService.create_growth_assets_for_task(
                session,
                task,
                "输出了巡检脚本、README 和回滚指引",
            )

            assert draft is not None
            assert draft.status == "incubating"
            assert draft.source_task_id == "task_growth_1"
            assert draft.content_json["source_context"]["completion_result"] == "输出了巡检脚本、README 和回滚指引"

            assert template is not None
            assert template.owner_aid == "agent://a2ahub/employer"
            assert template.template_json["preferred_worker_aid"] == "agent://a2ahub/worker"
            assert grant is None

            stored_draft = (
                await session.execute(
                    AgentSkillDraft.__table__.select().where(AgentSkillDraft.source_task_id == "task_growth_1")
                )
            ).first()
            stored_template = (
                await session.execute(
                    EmployerTaskTemplate.__table__.select().where(EmployerTaskTemplate.source_task_id == "task_growth_1")
                )
            ).first()
            stored_card = (
                await session.execute(
                    AgentExperienceCard.__table__.select().where(AgentExperienceCard.source_task_id == "task_growth_1")
                )
            ).first()

            assert stored_draft is not None
            assert stored_template is not None
            assert stored_card is not None
        finally:
            await close_session(session, engine)

    run(scenario())


def test_publish_skill_draft_creates_active_skill():
    async def scenario():
        session, engine = await create_session()
        try:
            draft = AgentSkillDraft(
                draft_id="draft_growth_1",
                aid="agent://a2ahub/worker",
                employer_aid="agent://a2ahub/employer",
                source_task_id="task_growth_publish",
                title="自动化发布流水线 · Growth Skill",
                summary="可复用的自动化发布经验",
                category="automation",
                content_json={"summary": "demo"},
                status="incubating",
                reward_snapshot=Decimal("66.00"),
            )
            session.add(draft)
            session.add(Task(
                task_id="task_growth_publish",
                employer_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/worker",
                title="自动化发布流水线",
                description="同源任务",
                requirements="脚本",
                reward=Decimal("66.00"),
                status="completed",
            ))
            await session.commit()

            updated = await GrowthService.update_skill_draft_status(
                session,
                "draft_growth_1",
                status="published",
                review_notes="审核通过",
            )

            assert updated is not None
            assert updated.status == "published"
            assert updated.published_skill_id is not None

            created_skill = (
                await session.execute(
                    Skill.__table__.select().where(Skill.skill_id == updated.published_skill_id)
                )
            ).first()
            assert created_skill is not None
        finally:
            await close_session(session, engine)

    run(scenario())


def test_openclaw_first_completed_task_auto_publishes_skill_and_grants_employer_reward():
    async def scenario():
        session, engine = await create_session()
        try:
            await session.execute(text(
                "INSERT INTO agents (aid, model, provider) VALUES (:aid, :model, :provider)"
            ), {
                "aid": "agent://a2ahub/openclaw-worker",
                "model": "openclaw-prod",
                "provider": "openclaw",
            })
            await session.execute(text(
                "INSERT INTO agents (aid, model, provider) VALUES (:aid, :model, :provider)"
            ), {
                "aid": "agent://a2ahub/employer",
                "model": "human-employer",
                "provider": "human",
            })
            await session.commit()

            task = Task(
                task_id="task_openclaw_bonus_1",
                employer_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/openclaw-worker",
                title="线上故障修复与复盘",
                description="修复故障并总结可复用操作流程",
                requirements="修复步骤, 验证结果, 复盘摘要",
                reward=Decimal("128.00"),
                escrow_id="escrow_openclaw_bonus_1",
                status="completed",
            )
            session.add(task)
            await session.commit()

            draft, template, grant = await GrowthService.create_growth_assets_for_task(
                session,
                task,
                "完成修复、验证服务恢复，并形成复盘手册",
            )

            assert draft is not None
            assert draft.status == "published"
            assert draft.published_skill_id is not None
            assert draft.review_required is False
            assert template is not None
            assert grant is not None
            assert grant.employer_aid == "agent://a2ahub/employer"
            assert grant.worker_aid == "agent://a2ahub/openclaw-worker"
            assert grant.skill_id == draft.published_skill_id
            assert grant.grant_payload["reason"] == "first_openclaw_success_bonus"

            skill_row = (
                await session.execute(Skill.__table__.select().where(Skill.skill_id == draft.published_skill_id))
            ).first()
            assert skill_row is not None

            grant_row = (
                await session.execute(
                    EmployerSkillGrant.__table__.select().where(EmployerSkillGrant.source_task_id == "task_openclaw_bonus_1")
                )
            ).first()
            assert grant_row is not None
        finally:
            await close_session(session, engine)

    run(scenario())


def test_create_task_from_template_reuses_payload():
    async def scenario():
        session, engine = await create_session()
        try:
            template = EmployerTaskTemplate(
                template_id="tmpl_growth_1",
                owner_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/worker",
                source_task_id="task_source_1",
                title="SEO 内容批量生产",
                summary="复用模板",
                template_json={
                    "title": "SEO 内容批量生产",
                    "description": "沿用历史任务的结构与验收方式",
                    "requirements": "关键词清单, 输出 Markdown",
                    "reward": "120.00",
                },
                status="active",
            )
            session.add(template)
            session.add(Task(
                task_id="task_source_1",
                employer_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/worker",
                title="source",
                description="source",
                requirements="source",
                reward=Decimal("30.00"),
                status="completed",
            ))
            await session.commit()

            task = await GrowthService.create_task_from_template(
                session,
                "tmpl_growth_1",
                owner_aid="agent://a2ahub/employer",
            )

            assert task is not None
            assert task.title == "SEO 内容批量生产"
            assert task.status == "open"
            assert task.reward == Decimal("120.00")
        finally:
            await close_session(session, engine)

    run(scenario())


def test_submission_result_is_reused_for_experience_card_without_explicit_accept_result():
    async def scenario():
        session, engine = await create_session()
        try:
            task = Task(
                task_id="task_growth_result_reuse",
                employer_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/worker",
                title="运维值守 SOP 生成",
                description="根据故障处理过程整理一份可复用 SOP",
                requirements="故障摘要, SOP, 风险提示",
                reward=Decimal("55.00"),
                escrow_id="escrow_growth_result_reuse",
                status="submitted",
            )
            session.add(task)
            await session.commit()

            await GrowthService.record_task_submission(session, task, result="输出 SOP、值守清单和风险提示")

            task.status = "completed"
            task.completed_at = datetime.now(timezone.utc)
            await session.commit()

            await GrowthService.create_growth_assets_for_task(session, task)
            card = await GrowthService.get_experience_card_by_task(session, "task_growth_result_reuse")

            assert card is not None
            assert card.delivery_snapshot_json["result"] == "输出 SOP、值守清单和风险提示"
        finally:
            await close_session(session, engine)

    run(scenario())


def test_revision_feedback_creates_and_resolves_risk_memory_after_acceptance():
    async def scenario():
        session, engine = await create_session()
        try:
            task = Task(
                task_id="task_growth_revision_1",
                employer_aid="agent://a2ahub/employer",
                worker_aid="agent://a2ahub/worker",
                title="知识库结构化整理",
                description="将杂乱知识库整理为结构化目录",
                requirements="目录树, 标签体系, 使用说明",
                reward=Decimal("72.00"),
                escrow_id="escrow_growth_revision_1",
                status="in_progress",
            )
            session.add(task)
            await session.commit()

            risk = await GrowthService.record_task_revision_feedback(
                session,
                task,
                actor_aid="agent://a2ahub/employer",
            )

            assert risk is not None
            assert risk.risk_type == "revision_requested"
            assert risk.status == "active"

            task.status = "completed"
            task.completed_at = datetime.now(timezone.utc)
            await session.commit()

            await GrowthService.create_growth_assets_for_task(
                session,
                task,
                "输出结构化目录、标签体系和使用说明",
            )

            stored_risk = (
                await session.execute(
                    AgentRiskMemory.__table__.select().where(AgentRiskMemory.risk_id == risk.risk_id)
                )
            ).first()
            card = await GrowthService.get_experience_card_by_task(session, "task_growth_revision_1")

            assert stored_risk is not None
            assert stored_risk._mapping["status"] == "resolved"
            assert stored_risk._mapping["resolved_at"] is not None
            assert card is not None
            assert card.revision_count == 1
            assert card.accepted_on_first_pass is False
        finally:
            await close_session(session, engine)

    run(scenario())
