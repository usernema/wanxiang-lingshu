import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, Tuple

from sqlalchemy import distinct, func, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.growth import (
    AgentExperienceCard,
    AgentRiskMemory,
    AgentSkillDraft,
    AgentTaskExperienceEvent,
    EmployerSkillGrant,
    EmployerTaskTemplate,
)
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
    def _slugify_text(value: Optional[str], limit: int = 96) -> str:
        if not value:
            return "general"
        compact = " ".join(value.split()).strip().lower()
        compact = re.sub(r"[^\w\u4e00-\u9fff]+", "-", compact, flags=re.UNICODE)
        compact = re.sub(r"-{2,}", "-", compact).strip("-")
        if not compact:
            return "general"
        return compact[:limit].strip("-") or "general"

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
    def _build_scenario_key(cls, task: Task, category: Optional[str] = None) -> str:
        scenario_category = category or cls._detect_category(task)
        title_key = cls._slugify_text(task.title, limit=72)
        return f"{scenario_category}:{title_key}"

    @staticmethod
    def _calculate_delivery_latency_hours(task: Task) -> Optional[int]:
        if not isinstance(task.created_at, datetime) or not isinstance(task.completed_at, datetime):
            return None
        created_at = task.created_at
        completed_at = task.completed_at
        if created_at.tzinfo is None and completed_at.tzinfo is not None:
            completed_at = completed_at.replace(tzinfo=None)
        elif created_at.tzinfo is not None and completed_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=None)
        delta = completed_at - created_at
        total_seconds = max(delta.total_seconds(), 0)
        return int(total_seconds // 3600)

    @classmethod
    def _build_task_event_payload(
        cls,
        task: Task,
        *,
        category: Optional[str] = None,
        result: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> dict:
        payload = {
            "task_id": task.task_id,
            "worker_aid": task.worker_aid,
            "employer_aid": task.employer_aid,
            "category": category or cls._detect_category(task),
            "reward": str(task.reward),
            "completed_at": task.completed_at.isoformat() if isinstance(task.completed_at, datetime) else None,
        }
        normalized_result = cls._normalize_result(result)
        if normalized_result:
            payload["result"] = normalized_result
        if extra:
            payload.update(extra)
        return payload

    @staticmethod
    async def _resolve_completion_result(
        db: AsyncSession,
        task_id: str,
        explicit_result: Optional[str] = None,
    ) -> Optional[str]:
        normalized = GrowthService._normalize_result(explicit_result)
        if normalized:
            return normalized

        result = await db.execute(
            select(AgentTaskExperienceEvent)
            .where(
                AgentTaskExperienceEvent.task_id == task_id,
                AgentTaskExperienceEvent.event_type == "task.completed.submitted",
            )
            .order_by(AgentTaskExperienceEvent.created_at.desc(), AgentTaskExperienceEvent.id.desc())
            .limit(1)
        )
        event = result.scalar_one_or_none()
        if not event:
            return None
        return GrowthService._normalize_result((event.payload_json or {}).get("result"))

    @staticmethod
    async def _count_revision_memories(
        db: AsyncSession,
        *,
        aid: str,
        task_id: str,
    ) -> int:
        result = await db.execute(
            select(func.count())
            .select_from(AgentRiskMemory)
            .where(
                AgentRiskMemory.aid == aid,
                AgentRiskMemory.source_task_id == task_id,
                AgentRiskMemory.risk_type == "revision_requested",
            )
        )
        return int(result.scalar() or 0)

    @staticmethod
    async def _resolve_revision_memories(
        db: AsyncSession,
        *,
        aid: str,
        task_id: str,
    ) -> int:
        result = await db.execute(
            select(AgentRiskMemory).where(
                AgentRiskMemory.aid == aid,
                AgentRiskMemory.source_task_id == task_id,
                AgentRiskMemory.risk_type == "revision_requested",
                AgentRiskMemory.resolved_at.is_(None),
            )
        )
        items = result.scalars().all()
        if not items:
            return 0

        resolved_at = datetime.now(timezone.utc)
        for item in items:
            item.status = "resolved"
            item.resolved_at = resolved_at
        return len(items)

    @classmethod
    async def _mark_cross_employer_validation(
        cls,
        db: AsyncSession,
        *,
        aid: str,
        scenario_key: str,
    ) -> bool:
        distinct_result = await db.execute(
            select(func.count(distinct(AgentExperienceCard.employer_aid))).where(
                AgentExperienceCard.aid == aid,
                AgentExperienceCard.scenario_key == scenario_key,
            )
        )
        distinct_employers = int(distinct_result.scalar() or 0)
        if distinct_employers < 2:
            return False

        await db.execute(
            update(AgentExperienceCard)
            .where(
                AgentExperienceCard.aid == aid,
                AgentExperienceCard.scenario_key == scenario_key,
            )
            .values(is_cross_employer_validated=True)
        )
        return True

    @classmethod
    async def _ensure_experience_card_for_task(
        cls,
        db: AsyncSession,
        task: Task,
        *,
        draft: Optional[AgentSkillDraft],
        result: Optional[str],
    ) -> Tuple[Optional[AgentExperienceCard], bool]:
        existing_result = await db.execute(
            select(AgentExperienceCard).where(AgentExperienceCard.source_task_id == task.task_id)
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            resolved_count = await cls._resolve_revision_memories(db, aid=task.worker_aid, task_id=task.task_id)
            if resolved_count:
                existing.accepted_on_first_pass = existing.revision_count == 0
            return existing, bool(resolved_count)

        category = draft.category if draft and draft.category else cls._detect_category(task)
        scenario_key = cls._build_scenario_key(task, category)
        useful_result = await cls._resolve_completion_result(db, task.task_id, result)
        revision_count = await cls._count_revision_memories(db, aid=task.worker_aid, task_id=task.task_id)
        accepted_on_first_pass = revision_count == 0
        quality_score = max(60, 100 - min(revision_count, 3) * 12)
        delivery_latency_hours = cls._calculate_delivery_latency_hours(task)
        reusable_fragments = draft.content_json if draft else {
            "execution_steps": [
                "确认任务目标与验收边界",
                "拆解输入并完成交付",
                "整理结构化结果，准备复用",
            ],
            "acceptance_checklist": [
                "覆盖任务目标",
                "满足关键约束",
                "可复用",
            ],
        }
        card = AgentExperienceCard(
            card_id=f"card_{uuid.uuid4().hex[:12]}",
            aid=task.worker_aid,
            employer_aid=task.employer_aid,
            source_task_id=task.task_id,
            category=category,
            scenario_key=scenario_key,
            title=task.title,
            summary=f"任务《{task.title}》已完成验收，沉淀为可复用经验卡。",
            task_snapshot_json={
                "title": task.title,
                "description": cls._summarize_text(task.description, limit=240),
                "requirements": cls._split_text_segments(task.requirements, fallback=[]),
                "reward": str(task.reward),
            },
            delivery_snapshot_json={
                "result": useful_result,
                "accepted_on_first_pass": accepted_on_first_pass,
                "revision_count": revision_count,
                "delivery_latency_hours": delivery_latency_hours,
                "completed_at": task.completed_at.isoformat() if isinstance(task.completed_at, datetime) else None,
            },
            reusable_fragments_json={
                "applicable_scenarios": reusable_fragments.get("applicable_scenarios", []),
                "execution_steps": reusable_fragments.get("execution_steps", []),
                "acceptance_checklist": reusable_fragments.get("acceptance_checklist", []),
                "output_template": reusable_fragments.get("output_template"),
            },
            outcome_status="accepted",
            accepted_on_first_pass=accepted_on_first_pass,
            revision_count=revision_count,
            quality_score=quality_score,
            delivery_latency_hours=delivery_latency_hours,
        )
        db.add(card)
        await db.flush()
        card.is_cross_employer_validated = await cls._mark_cross_employer_validation(
            db,
            aid=task.worker_aid,
            scenario_key=scenario_key,
        )
        resolved_revision_count = await cls._resolve_revision_memories(db, aid=task.worker_aid, task_id=task.task_id)
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type="task.completed.accepted",
                payload_json=cls._build_task_event_payload(
                    task,
                    category=category,
                    result=useful_result,
                    extra={
                        "accepted_on_first_pass": accepted_on_first_pass,
                        "revision_count": revision_count,
                        "experience_card_id": card.card_id,
                        "resolved_revision_risk_count": resolved_revision_count,
                    },
                ),
            )
        )
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type="growth.experience_card.created",
                payload_json={
                    "experience_card_id": card.card_id,
                    "scenario_key": scenario_key,
                    "category": category,
                    "quality_score": quality_score,
                    "is_cross_employer_validated": card.is_cross_employer_validated,
                },
            )
        )
        return card, True

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
        useful_result = await cls._resolve_completion_result(db, task.task_id, result)
        active_skill_count = await cls._count_active_skills(db, task.worker_aid)
        worker_is_openclaw = await cls._is_openclaw_agent(db, task.worker_aid)

        if not draft:
            title, summary, category, payload = cls._build_draft_payload(task, useful_result, active_skill_count)
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
            title, summary, payload = cls._build_template_payload(task, useful_result)
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

        _, experience_card_changed = await cls._ensure_experience_card_for_task(
            db,
            task,
            draft=draft,
            result=useful_result,
        )
        changed = changed or experience_card_changed

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
    async def get_experience_card_by_task(
        db: AsyncSession,
        task_id: str,
    ) -> Optional[AgentExperienceCard]:
        result = await db.execute(
            select(AgentExperienceCard).where(AgentExperienceCard.source_task_id == task_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_experience_cards(
        db: AsyncSession,
        *,
        limit: int = 20,
        offset: int = 0,
        aid: Optional[str] = None,
        category: Optional[str] = None,
        outcome_status: Optional[str] = None,
    ):
        query = select(AgentExperienceCard)
        if aid:
            query = query.where(AgentExperienceCard.aid == aid)
        if category:
            query = query.where(AgentExperienceCard.category == category)
        if outcome_status:
            query = query.where(AgentExperienceCard.outcome_status == outcome_status)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int((await db.execute(count_query)).scalar() or 0)
        items = (
            await db.execute(
                query.order_by(AgentExperienceCard.created_at.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return items, total

    @staticmethod
    async def list_risk_memories(
        db: AsyncSession,
        *,
        limit: int = 20,
        offset: int = 0,
        aid: Optional[str] = None,
        status: Optional[str] = None,
        risk_type: Optional[str] = None,
    ):
        query = select(AgentRiskMemory)
        if aid:
            query = query.where(AgentRiskMemory.aid == aid)
        if status:
            query = query.where(AgentRiskMemory.status == status)
        if risk_type:
            query = query.where(AgentRiskMemory.risk_type == risk_type)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = int((await db.execute(count_query)).scalar() or 0)
        items = (
            await db.execute(
                query.order_by(AgentRiskMemory.created_at.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return items, total

    @classmethod
    async def record_task_submission(
        cls,
        db: AsyncSession,
        task: Task,
        *,
        result: Optional[str] = None,
    ) -> None:
        if not task.worker_aid:
            return

        category = cls._detect_category(task)
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type="task.completed.submitted",
                payload_json=cls._build_task_event_payload(
                    task,
                    category=category,
                    result=result,
                    extra={"submission_status": task.status},
                ),
            )
        )
        await db.commit()

    @classmethod
    async def record_task_revision_feedback(
        cls,
        db: AsyncSession,
        task: Task,
        *,
        actor_aid: Optional[str] = None,
    ) -> Optional[AgentRiskMemory]:
        if not task.worker_aid or not task.employer_aid:
            return None

        category = cls._detect_category(task)
        revision_count = await cls._count_revision_memories(db, aid=task.worker_aid, task_id=task.task_id) + 1
        severity = "medium" if revision_count >= 2 else "low"
        risk = AgentRiskMemory(
            risk_id=f"risk_{uuid.uuid4().hex[:12]}",
            aid=task.worker_aid,
            employer_aid=task.employer_aid,
            source_task_id=task.task_id,
            risk_type="revision_requested",
            severity=severity,
            category=category,
            trigger_event="task.completed.revision_requested",
            status="active",
            evidence_json={
                "revision_count": revision_count,
                "requested_by": actor_aid,
                "task_status_after_revision": task.status,
            },
            cooldown_until=datetime.now(timezone.utc) + timedelta(days=1 if revision_count == 1 else 3),
        )
        db.add(risk)
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type="task.completed.revision_requested",
                payload_json=cls._build_task_event_payload(
                    task,
                    category=category,
                    extra={
                        "revision_count": revision_count,
                        "severity": severity,
                        "requested_by": actor_aid,
                        "risk_id": risk.risk_id,
                    },
                ),
            )
        )
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type="growth.risk_memory.created",
                payload_json={
                    "risk_id": risk.risk_id,
                    "risk_type": risk.risk_type,
                    "severity": severity,
                    "status": risk.status,
                },
            )
        )
        await db.commit()
        await db.refresh(risk)
        return risk

    @classmethod
    async def record_task_cancellation_feedback(
        cls,
        db: AsyncSession,
        task: Task,
        *,
        actor_aid: Optional[str] = None,
        previous_status: Optional[str] = None,
    ) -> Optional[AgentRiskMemory]:
        if not task.worker_aid or not task.employer_aid:
            return None

        category = cls._detect_category(task)
        cancelled_after_delivery = previous_status == "submitted"
        trigger_event = "task.cancelled.after_delivery" if cancelled_after_delivery else "task.cancelled.before_delivery"
        severity = "high" if cancelled_after_delivery or previous_status == "in_progress" else "medium"
        risk_type = "delivery_cancelled" if cancelled_after_delivery else "assignment_cancelled"
        cooldown_days = 7 if severity == "high" else 3
        risk = AgentRiskMemory(
            risk_id=f"risk_{uuid.uuid4().hex[:12]}",
            aid=task.worker_aid,
            employer_aid=task.employer_aid,
            source_task_id=task.task_id,
            risk_type=risk_type,
            severity=severity,
            category=category,
            trigger_event=trigger_event,
            status="active",
            evidence_json={
                "cancelled_by": actor_aid,
                "previous_status": previous_status,
                "cancelled_at": task.cancelled_at.isoformat() if isinstance(task.cancelled_at, datetime) else None,
            },
            cooldown_until=datetime.now(timezone.utc) + timedelta(days=cooldown_days),
        )
        db.add(risk)
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type=trigger_event,
                payload_json=cls._build_task_event_payload(
                    task,
                    category=category,
                    extra={
                        "risk_id": risk.risk_id,
                        "risk_type": risk_type,
                        "severity": severity,
                        "previous_status": previous_status,
                        "cancelled_by": actor_aid,
                    },
                ),
            )
        )
        db.add(
            AgentTaskExperienceEvent(
                aid=task.worker_aid,
                task_id=task.task_id,
                event_type="growth.risk_memory.created",
                payload_json={
                    "risk_id": risk.risk_id,
                    "risk_type": risk.risk_type,
                    "severity": severity,
                    "status": risk.status,
                },
            )
        )
        await db.commit()
        await db.refresh(risk)
        return risk

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
