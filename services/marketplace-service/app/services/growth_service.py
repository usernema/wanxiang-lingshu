import re
import uuid
from decimal import Decimal
from typing import Optional, Tuple

from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.growth import AgentSkillDraft, AgentTaskExperienceEvent, EmployerSkillGrant, EmployerTaskTemplate
from app.models.skill import Skill
from app.models.task import Task


class GrowthService:
    VALID_DRAFT_STATUSES = {"draft", "incubating", "validated", "published", "archived"}

    @staticmethod
    def _split_text_segments(value: Optional[str], *, fallback: Optional[list[str]] = None, limit: int = 6) -> list[str]:
        if not value:
            return fallback[:] if fallback else []

        segments = [
            item.strip()
            for item in re.split(r"[\n,;|，；]+", value)
            if item and item.strip()
        ]
        if not segments and fallback:
            return fallback[:]
        return segments[:limit]

    @staticmethod
    def _summarize_text(value: Optional[str], limit: int = 120) -> str:
        if not value:
            return ""
        compact = " ".join(value.split())
        if len(compact) <= limit:
            return compact
        return f"{compact[:limit].rstrip()}…"

    @staticmethod
    def _normalize_result(result: Optional[str]) -> Optional[str]:
        if not result:
            return None
        normalized = " ".join(result.split()).strip()
        if normalized.lower() in {"done", "ok", "completed", "success"}:
            return None
        return normalized

    @staticmethod
    async def _count_active_skills(db: AsyncSession, aid: str) -> int:
        result = await db.execute(
            select(func.count()).select_from(Skill).where(
                Skill.author_aid == aid,
                Skill.status == "active",
            )
        )
        return int(result.scalar() or 0)

    @staticmethod
    async def _is_openclaw_agent(db: AsyncSession, aid: str) -> bool:
        try:
            result = await db.execute(
                text("SELECT provider, model FROM agents WHERE aid = :aid LIMIT 1"),
                {"aid": aid},
            )
        except SQLAlchemyError:
            return False

        row = result.first()
        if not row:
            return False

        mapping = row._mapping
        provider = (mapping.get("provider") or "").strip().lower()
        model = (mapping.get("model") or "").strip().lower()
        return provider == "openclaw" or "openclaw" in model

    @staticmethod
    def _detect_category(task: Task) -> str:
        text = " ".join(filter(None, [task.title, task.description, task.requirements])).lower()
        if any(keyword in text for keyword in {"content", "seo", "write", "post", "forum", "copy"}):
            return "content"
        if any(keyword in text for keyword in {"data", "analysis", "sql", "report", "research"}):
            return "data"
        if any(keyword in text for keyword in {"automation", "workflow", "ops", "deploy", "integration"}):
            return "automation"
        if any(keyword in text for keyword in {"support", "customer", "review", "qa"}):
            return "support"
        return "development"

    @classmethod
    def _build_draft_payload(cls, task: Task, result: Optional[str], active_skill_count: int) -> Tuple[str, str, str, dict]:
        category = cls._detect_category(task)
        useful_result = cls._normalize_result(result)
        requirements = cls._split_text_segments(task.requirements, fallback=["任务目标说明", "输入材料", "验收边界"])
        summary_prefix = "首单成功经验已沉淀为成长 Skill 草稿。" if active_skill_count == 0 else "成功任务经验已沉淀为可复用 Skill 草稿。"
        summary = f"{summary_prefix} 来源任务《{task.title}》，可用于后续同类任务复用与后台审核。"
        title = f"{task.title} · Growth Skill"
        payload = {
            "title": title,
            "summary": summary,
            "applicable_scenarios": [
                f"复用任务《{task.title}》的同类交付",
                f"{category} 场景的标准化执行",
            ],
            "required_inputs": requirements,
            "execution_steps": [
                f"确认任务目标与验收范围：{task.title}",
                "拆解输入、边界与优先级，形成可执行步骤",
                "按要求完成交付并进行自检",
                useful_result or "整理最终结果与成功经验，形成可复用模板",
            ],
            "output_template": useful_result or f"围绕《{task.title}》输出结构化交付结果与复盘摘要",
            "acceptance_checklist": [
                "覆盖任务描述中的核心目标",
                "满足 requirements 中的关键约束",
                "结果可被下次任务直接复用或稍作修改后复用",
            ],
            "risk_boundaries": [
                "超出原任务授权范围的需求需重新确认",
                "涉及敏感数据或高风险操作时需人工复核",
            ],
            "source_task_ids": [task.task_id],
            "source_context": {
                "task_title": task.title,
                "task_description": task.description,
                "task_requirements": task.requirements or "",
                "completion_result": useful_result,
            },
        }
        return title, summary, category, payload

    @classmethod
    def _build_template_payload(cls, task: Task, result: Optional[str]) -> Tuple[str, str, dict]:
        useful_result = cls._normalize_result(result)
        summary = f"基于任务《{task.title}》生成的雇主私有模板，可一键复用发布相似任务。"
        payload = {
            "title": task.title,
            "description": task.description,
            "requirements": task.requirements or "",
            "reward": str(task.reward),
            "preferred_worker_aid": task.worker_aid,
            "acceptance_focus": [
                "确认输出是否覆盖任务目标",
                "确认交付格式是否满足实际使用",
                "确认可直接进入下一步业务流转",
            ],
            "reference_result": useful_result,
        }
        return task.title, summary, payload

    @staticmethod
    async def _publish_skill_from_draft(
        db: AsyncSession,
        draft: AgentSkillDraft,
        *,
        auto_publish: bool = False,
        review_notes: Optional[str] = None,
    ) -> AgentSkillDraft:
        draft.status = "published"
        draft.review_required = False
        if review_notes and review_notes.strip():
            draft.review_notes = review_notes.strip()

        if not draft.published_skill_id:
            skill = Skill(
                skill_id=f"skill_{uuid.uuid4().hex[:12]}",
                author_aid=draft.aid,
                name=draft.title[:128],
                description=draft.summary,
                category=draft.category or "growth",
                price=Decimal("0"),
                status="active",
            )
            db.add(skill)
            await db.flush()
            draft.published_skill_id = skill.skill_id

        db.add(
            AgentTaskExperienceEvent(
                aid=draft.aid,
                task_id=draft.source_task_id,
                event_type="skill.auto_published" if auto_publish else "skill.draft.status.updated",
                payload_json={
                    "draft_id": draft.draft_id,
                    "status": draft.status,
                    "published_skill_id": draft.published_skill_id,
                    "auto_publish": auto_publish,
                },
            )
        )
        return draft

    @staticmethod
    def _build_grant_payload(task: Task, draft: AgentSkillDraft, active_skill_count: int) -> dict:
        return {
            "reason": "first_openclaw_success_bonus",
            "task_title": task.title,
            "task_reward": str(task.reward),
            "worker_aid": task.worker_aid,
            "employer_aid": task.employer_aid,
            "source_draft_id": draft.draft_id,
            "published_skill_id": draft.published_skill_id,
            "active_skill_count_before": active_skill_count,
            "message": "系统自动把零 Skill OpenClaw 的首单成功经验整理为 Skill，并赠送给雇主留作复用资产。",
        }

    @classmethod
    async def _create_employer_skill_grant(
        cls,
        db: AsyncSession,
        *,
        task: Task,
        draft: AgentSkillDraft,
        active_skill_count: int,
    ) -> EmployerSkillGrant:
        grant = EmployerSkillGrant(
            grant_id=f"grant_{uuid.uuid4().hex[:12]}",
            employer_aid=task.employer_aid,
            worker_aid=task.worker_aid,
            source_task_id=task.task_id,
            source_draft_id=draft.draft_id,
            skill_id=draft.published_skill_id,
            title=draft.title,
            summary=f"来自任务《{task.title}》的成功经验已整理为赠送 Skill，可直接复用或作为下次雇佣参考。",
            category=draft.category,
            grant_payload=cls._build_grant_payload(task, draft, active_skill_count),
            status="granted",
        )
        db.add(grant)
        db.add(
            AgentTaskExperienceEvent(
                aid=task.employer_aid,
                task_id=task.task_id,
                event_type="employer.skill.granted",
                payload_json={
                    "grant_id": grant.grant_id,
                    "skill_id": draft.published_skill_id,
                    "worker_aid": task.worker_aid,
                    "source_draft_id": draft.draft_id,
                },
            )
        )
        return grant

    @classmethod
    async def create_growth_assets_for_task(
        cls,
        db: AsyncSession,
        task: Task,
        result: Optional[str] = None,
    ) -> Tuple[Optional[AgentSkillDraft], Optional[EmployerTaskTemplate], Optional[EmployerSkillGrant]]:
        if task.status != "completed" or not task.worker_aid or not task.employer_aid:
            return None, None, None

        existing_draft_result = await db.execute(
            select(AgentSkillDraft).where(AgentSkillDraft.source_task_id == task.task_id)
        )
        existing_template_result = await db.execute(
            select(EmployerTaskTemplate).where(EmployerTaskTemplate.source_task_id == task.task_id)
        )
        existing_grant_result = await db.execute(
            select(EmployerSkillGrant).where(EmployerSkillGrant.source_task_id == task.task_id)
        )
        draft = existing_draft_result.scalar_one_or_none()
        template = existing_template_result.scalar_one_or_none()
        grant = existing_grant_result.scalar_one_or_none()

        created_records = []
        changed = False
        active_skill_count = await cls._count_active_skills(db, task.worker_aid)
        worker_is_openclaw = await cls._is_openclaw_agent(db, task.worker_aid)

        if not draft:
            title, summary, category, payload = cls._build_draft_payload(task, result, active_skill_count)
            draft = AgentSkillDraft(
                draft_id=f"draft_{uuid.uuid4().hex[:12]}",
                aid=task.worker_aid,
                employer_aid=task.employer_aid,
                source_task_id=task.task_id,
                title=title,
                summary=summary,
                category=category,
                content_json=payload,
                status="incubating",
                review_required=True,
                reward_snapshot=task.reward,
            )
            db.add(draft)
            changed = True
            created_records.append(
                AgentTaskExperienceEvent(
                    aid=task.worker_aid,
                    task_id=task.task_id,
                    event_type="skill.draft.created",
                    payload_json={
                        "draft_id": draft.draft_id,
                        "category": category,
                        "active_skill_count_before": active_skill_count,
                    },
                )
            )

        if not template:
            title, summary, payload = cls._build_template_payload(task, result)
            template = EmployerTaskTemplate(
                template_id=f"tmpl_{uuid.uuid4().hex[:12]}",
                owner_aid=task.employer_aid,
                worker_aid=task.worker_aid,
                source_task_id=task.task_id,
                title=title,
                summary=summary,
                template_json=payload,
                status="active",
            )
            db.add(template)
            changed = True
            created_records.append(
                AgentTaskExperienceEvent(
                    aid=task.employer_aid,
                    task_id=task.task_id,
                    event_type="employer.template.created",
                    payload_json={
                        "template_id": template.template_id,
                        "worker_aid": task.worker_aid,
                    },
                )
            )

        should_auto_publish_first_skill = bool(worker_is_openclaw and active_skill_count == 0 and draft)
        if should_auto_publish_first_skill and draft and not draft.published_skill_id:
            await cls._publish_skill_from_draft(
                db,
                draft,
                auto_publish=True,
                review_notes="系统自动发布：OpenClaw 首单成功经验已沉淀为 Skill。",
            )
            changed = True

        if should_auto_publish_first_skill and draft and draft.published_skill_id and not grant:
            grant = await cls._create_employer_skill_grant(
                db,
                task=task,
                draft=draft,
                active_skill_count=active_skill_count,
            )
            changed = True

        for record in created_records:
            db.add(record)

        if created_records or changed:
            await db.commit()
            if draft:
                await db.refresh(draft)
            if template:
                await db.refresh(template)
            if grant:
                await db.refresh(grant)

        return draft, template, grant

    @staticmethod
    async def list_skill_drafts(
        db: AsyncSession,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        aid: Optional[str] = None,
    ):
        query = select(AgentSkillDraft)
        if status:
            query = query.where(AgentSkillDraft.status == status)
        if aid:
            query = query.where(AgentSkillDraft.aid == aid)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int((await db.execute(count_query)).scalar() or 0)
        items = (
            await db.execute(
                query.order_by(AgentSkillDraft.created_at.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return items, total

    @staticmethod
    async def list_employer_templates(
        db: AsyncSession,
        *,
        limit: int = 20,
        offset: int = 0,
        owner_aid: Optional[str] = None,
        status: Optional[str] = None,
    ):
        query = select(EmployerTaskTemplate)
        if owner_aid:
            query = query.where(EmployerTaskTemplate.owner_aid == owner_aid)
        if status:
            query = query.where(EmployerTaskTemplate.status == status)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int((await db.execute(count_query)).scalar() or 0)
        items = (
            await db.execute(
                query.order_by(EmployerTaskTemplate.created_at.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return items, total

    @staticmethod
    async def list_employer_skill_grants(
        db: AsyncSession,
        *,
        limit: int = 20,
        offset: int = 0,
        employer_aid: Optional[str] = None,
        status: Optional[str] = None,
    ):
        query = select(EmployerSkillGrant)
        if employer_aid:
            query = query.where(EmployerSkillGrant.employer_aid == employer_aid)
        if status:
            query = query.where(EmployerSkillGrant.status == status)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int((await db.execute(count_query)).scalar() or 0)
        items = (
            await db.execute(
                query.order_by(EmployerSkillGrant.created_at.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return items, total

    @classmethod
    async def update_skill_draft_status(
        cls,
        db: AsyncSession,
        draft_id: str,
        *,
        status: str,
        review_notes: Optional[str] = None,
    ) -> Optional[AgentSkillDraft]:
        if status not in cls.VALID_DRAFT_STATUSES:
            raise ValueError("Invalid draft status")

        result = await db.execute(select(AgentSkillDraft).where(AgentSkillDraft.draft_id == draft_id))
        draft = result.scalar_one_or_none()
        if not draft:
            return None

        draft.status = status
        draft.review_required = status in {"draft", "incubating"}
        draft.review_notes = review_notes.strip() if review_notes and review_notes.strip() else None

        if status == "published" and not draft.published_skill_id:
            await cls._publish_skill_from_draft(db, draft, auto_publish=False, review_notes=draft.review_notes)
        else:
            db.add(
                AgentTaskExperienceEvent(
                    aid=draft.aid,
                    task_id=draft.source_task_id,
                    event_type="skill.draft.status.updated",
                    payload_json={
                        "draft_id": draft.draft_id,
                        "status": status,
                        "published_skill_id": draft.published_skill_id,
                    },
                )
            )
        await db.commit()
        await db.refresh(draft)
        return draft

    @staticmethod
    async def create_task_from_template(
        db: AsyncSession,
        template_id: str,
        *,
        owner_aid: str,
    ) -> Optional[Task]:
        result = await db.execute(
            select(EmployerTaskTemplate).where(EmployerTaskTemplate.template_id == template_id)
        )
        template = result.scalar_one_or_none()
        if not template:
            return None
        if template.owner_aid != owner_aid:
            raise PermissionError("Only template owner can create tasks from it")
        if template.status != "active":
            raise ValueError("Template is not active")

        payload = template.template_json or {}
        task = Task(
            task_id=f"task_{uuid.uuid4().hex[:12]}",
            employer_aid=owner_aid,
            title=str(payload.get("title") or template.title),
            description=str(payload.get("description") or template.summary),
            requirements=str(payload.get("requirements") or ""),
            reward=Decimal(str(payload.get("reward") or "0")),
            status="open",
        )
        db.add(task)
        template.reuse_count += 1
        db.add(
            AgentTaskExperienceEvent(
                aid=owner_aid,
                task_id=task.task_id,
                event_type="employer.template.reused",
                payload_json={
                    "template_id": template.template_id,
                    "source_task_id": template.source_task_id,
                },
            )
        )
        await db.commit()
        await db.refresh(task)
        await db.refresh(template)
        return task
