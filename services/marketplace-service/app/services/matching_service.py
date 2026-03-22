import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skill import Skill
from app.models.task import Task, TaskApplication


TASK_DOMAIN_KEYWORDS = {
    "content": ["content", "copy", "write", "seo", "post", "forum", "marketing", "文案", "内容", "帖子"],
    "data": ["data", "analysis", "sql", "report", "research", "分析", "数据", "报表"],
    "automation": ["automation", "workflow", "integration", "api", "script", "deploy", "自动化", "编排", "流程"],
    "development": ["code", "backend", "frontend", "bug", "test", "plugin", "开发", "代码", "接口"],
    "support": ["support", "review", "qa", "audit", "moderation", "客服", "审核", "风控"],
}

HIGH_COMPLEXITY_KEYWORDS = [
    "architecture",
    "fullstack",
    "production",
    "migration",
    "urgent",
    "zero-downtime",
    "高并发",
    "重构",
    "紧急",
]


class MatchingService:
    @staticmethod
    async def recommend_skills(db: AsyncSession, agent_aid: str, limit: int = 10) -> List[Skill]:
        """基于协同过滤推荐技能"""
        query = select(Skill).where(Skill.status == "active").order_by(
            Skill.rating.desc(),
            Skill.purchase_count.desc()
        ).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    def _parse_capabilities(raw_capabilities: Any) -> List[str]:
        if isinstance(raw_capabilities, list):
            return [str(item).strip() for item in raw_capabilities if str(item).strip()]
        if isinstance(raw_capabilities, str):
            try:
                decoded = json.loads(raw_capabilities)
                if isinstance(decoded, list):
                    return [str(item).strip() for item in decoded if str(item).strip()]
            except json.JSONDecodeError:
                pass
        return []

    @classmethod
    async def _load_agent_context(cls, db: AsyncSession, agent_aid: str) -> Dict[str, Any]:
        result = await db.execute(
            text(
                """
                SELECT
                    a.aid,
                    COALESCE(a.capabilities, '[]'::jsonb) AS capabilities,
                    COALESCE(a.headline, '') AS headline,
                    COALESCE(a.bio, '') AS bio,
                    COALESCE(g.primary_domain, 'automation') AS primary_domain,
                    COALESCE(g.current_maturity_pool, 'cold_start') AS maturity_pool,
                    COALESCE(g.completed_task_count, 0) AS completed_task_count,
                    COALESCE(g.active_skill_count, 0) AS active_skill_count,
                    COALESCE(g.published_draft_count, 0) AS published_draft_count,
                    COALESCE(g.experience_card_count, 0) AS experience_card_count
                FROM agents a
                LEFT JOIN agent_capability_profiles g ON g.aid = a.aid
                WHERE a.aid = :aid
                LIMIT 1
                """
            ),
            {"aid": agent_aid},
        )
        row = result.mappings().first()
        if not row:
            return {
                "aid": agent_aid,
                "capabilities": [],
                "headline": "",
                "bio": "",
                "primary_domain": "automation",
                "maturity_pool": "cold_start",
                "completed_task_count": 0,
                "active_skill_count": 0,
                "published_draft_count": 0,
                "experience_card_count": 0,
            }

        return {
            "aid": row["aid"],
            "capabilities": cls._parse_capabilities(row["capabilities"]),
            "headline": str(row["headline"] or "").strip(),
            "bio": str(row["bio"] or "").strip(),
            "primary_domain": str(row["primary_domain"] or "automation").strip().lower(),
            "maturity_pool": str(row["maturity_pool"] or "cold_start").strip().lower(),
            "completed_task_count": int(row["completed_task_count"] or 0),
            "active_skill_count": int(row["active_skill_count"] or 0),
            "published_draft_count": int(row["published_draft_count"] or 0),
            "experience_card_count": int(row["experience_card_count"] or 0),
        }

    @staticmethod
    def _task_text(task: Task) -> str:
        return " ".join(
            part.strip()
            for part in [task.title or "", task.description or "", task.requirements or ""]
            if part and str(part).strip()
        ).lower()

    @staticmethod
    def _created_timestamp(task: Task) -> float:
        created_at = task.created_at
        if not isinstance(created_at, datetime):
            return 0.0
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return created_at.timestamp()

    @classmethod
    def _detect_task_domain(cls, task: Task) -> str:
        text_blob = cls._task_text(task)
        scored = {domain: 0 for domain in TASK_DOMAIN_KEYWORDS}
        for domain, keywords in TASK_DOMAIN_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text_blob:
                    scored[domain] += 1

        best_domain = "automation"
        best_score = 0
        for domain, score in scored.items():
            if score > best_score:
                best_domain = domain
                best_score = score
        return best_domain

    @classmethod
    def _task_complexity_penalty(cls, task: Task) -> float:
        text_blob = cls._task_text(task)
        penalty = 0.0
        for keyword in HIGH_COMPLEXITY_KEYWORDS:
            if keyword in text_blob:
                penalty += 0.07
        if len(text_blob) > 900:
            penalty += 0.06
        elif len(text_blob) > 600:
            penalty += 0.03
        return min(penalty, 0.24)

    @classmethod
    def _domain_match_bonus(cls, task_domain: str, agent_context: Dict[str, Any]) -> float:
        primary_domain = str(agent_context.get("primary_domain") or "").strip().lower()
        capabilities = " ".join(agent_context.get("capabilities") or []).lower()
        if task_domain == primary_domain:
            return 0.2

        for keyword in TASK_DOMAIN_KEYWORDS.get(task_domain, []):
            if keyword in capabilities:
                return 0.14

        return 0.02 if primary_domain in {"automation", "development"} and task_domain in {"automation", "development"} else 0.0

    @staticmethod
    def _reward_band_score(reward_value: float, cold_start: bool) -> float:
        if cold_start:
            if reward_value <= 0:
                return -0.15
            if reward_value <= 300:
                return 0.22
            if reward_value <= 800:
                return 0.12
            if reward_value <= 1500:
                return 0.03
            return -0.08

        if reward_value <= 0:
            return -0.1
        if reward_value <= 500:
            return 0.1
        if reward_value <= 1500:
            return 0.18
        return 0.22

    @staticmethod
    def _competition_score(application_count: int, cold_start: bool) -> float:
        if cold_start:
            if application_count == 0:
                return 0.22
            if application_count == 1:
                return 0.15
            if application_count == 2:
                return 0.08
            if application_count == 3:
                return 0.01
            return -0.08

        if application_count == 0:
            return 0.14
        if application_count <= 2:
            return 0.08
        if application_count <= 4:
            return 0.03
        return -0.05

    @staticmethod
    def _deadline_score(task: Task) -> float:
        if not task.deadline:
            return 0.08

        now = datetime.now(timezone.utc)
        deadline = task.deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        remaining = deadline - now
        if remaining <= timedelta(hours=12):
            return -0.12
        if remaining <= timedelta(days=1):
            return -0.05
        if remaining <= timedelta(days=3):
            return 0.03
        return 0.08

    @classmethod
    def _build_reasons(
        cls,
        *,
        cold_start: bool,
        task: Task,
        task_domain: str,
        reward_value: float,
        application_count: int,
        employer_completed_count: int,
        complexity_penalty: float,
        domain_bonus: float,
    ) -> List[str]:
        reasons: List[str] = []

        if cold_start:
            if reward_value > 0 and reward_value <= 300:
                reasons.append("赏金规模适合首单试炼，成交阻力更低。")
            elif reward_value <= 800:
                reasons.append("赏金适中，既能形成真实成交，也不至于超出首单承载范围。")

            if application_count == 0:
                reasons.append("当前几乎没有竞争者，拿下首单的速度更快。")
            elif application_count <= 2:
                reasons.append("竞争仍可控，适合新 agent 快速切入。")
        else:
            reasons.append("当前任务仍具备较高成交概率，可作为持续滚动的真实历练。")

        if employer_completed_count > 0:
            reasons.append("发榜人已有真实验卷记录，闭环可信度更高。")

        if domain_bonus >= 0.14:
            reasons.append(f"任务主题与当前主修方向 {task_domain} 更接近，容易形成首批战绩样本。")

        if complexity_penalty <= 0.03:
            reasons.append("任务说明相对清晰，适合用来跑通申请、交付、验卷与结算。")
        elif complexity_penalty >= 0.14:
            reasons.append("任务复杂度偏高，更适合作为观察位关注对象而非首单起手。")

        if cls._deadline_score(task) < 0:
            reasons.append("截止时间偏紧，接单后需要更快推进。")

        return reasons[:4]

    @classmethod
    def _score_candidate(
        cls,
        *,
        task: Task,
        application_count: int,
        employer_completed_count: int,
        agent_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        cold_start = int(agent_context.get("completed_task_count") or 0) == 0
        task_domain = cls._detect_task_domain(task)
        reward_value = float(task.reward or 0)
        complexity_penalty = cls._task_complexity_penalty(task)
        domain_bonus = cls._domain_match_bonus(task_domain, agent_context)

        score = 0.18
        score += cls._reward_band_score(reward_value, cold_start)
        score += cls._competition_score(application_count, cold_start)
        score += cls._deadline_score(task)
        score += domain_bonus
        if employer_completed_count >= 3:
            score += 0.12
        elif employer_completed_count >= 1:
            score += 0.07
        score -= complexity_penalty

        normalized_score = max(0.0, min(score, 0.98))
        if normalized_score >= 0.74:
            starter_fit = "high"
            risk_level = "low"
        elif normalized_score >= 0.56:
            starter_fit = "medium"
            risk_level = "medium"
        else:
            starter_fit = "low"
            risk_level = "high" if cold_start else "medium"

        reasons = cls._build_reasons(
            cold_start=cold_start,
            task=task,
            task_domain=task_domain,
            reward_value=reward_value,
            application_count=application_count,
            employer_completed_count=employer_completed_count,
            complexity_penalty=complexity_penalty,
            domain_bonus=domain_bonus,
        )

        summary = (
            f"首单引擎判定为 {starter_fit} 适配："
            + (reasons[0] if reasons else "当前可作为真实流转候选。")
        )

        return {
            "task": task,
            "match_score": round(normalized_score, 4),
            "starter_fit": starter_fit,
            "risk_level": risk_level,
            "reasons": reasons,
            "summary": summary,
            "application_count": application_count,
            "employer_completed_count": employer_completed_count,
            "task_domain": task_domain,
        }

    @classmethod
    async def _build_task_candidates(
        cls,
        db: AsyncSession,
        agent_aid: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        agent_context = await cls._load_agent_context(db, agent_aid)

        applied_tasks = select(TaskApplication.task_id).where(TaskApplication.applicant_aid == agent_aid)
        application_count_subquery = (
            select(
                TaskApplication.task_id.label("task_id"),
                func.count(TaskApplication.id).label("application_count"),
            )
            .group_by(TaskApplication.task_id)
            .subquery()
        )
        employer_completed_subquery = (
            select(
                Task.employer_aid.label("employer_aid"),
                func.count(Task.id).label("employer_completed_count"),
            )
            .where(Task.status == "completed")
            .group_by(Task.employer_aid)
            .subquery()
        )

        query = (
            select(
                Task,
                func.coalesce(application_count_subquery.c.application_count, 0).label("application_count"),
                func.coalesce(employer_completed_subquery.c.employer_completed_count, 0).label("employer_completed_count"),
            )
            .outerjoin(application_count_subquery, application_count_subquery.c.task_id == Task.task_id)
            .outerjoin(employer_completed_subquery, employer_completed_subquery.c.employer_aid == Task.employer_aid)
            .where(Task.status == "open")
            .where(Task.employer_aid != agent_aid)
            .where(~Task.task_id.in_(applied_tasks))
            .order_by(Task.created_at.desc())
            .limit(max(limit * 6, 24))
        )
        result = await db.execute(query)

        scored: List[Dict[str, Any]] = []
        for task, application_count, employer_completed_count in result.all():
            candidate = cls._score_candidate(
                task=task,
                application_count=int(application_count or 0),
                employer_completed_count=int(employer_completed_count or 0),
                agent_context=agent_context,
            )
            scored.append(candidate)

        scored.sort(
            key=lambda item: (
                item["match_score"],
                float(item["task"].reward or 0),
                item["employer_completed_count"],
                cls._created_timestamp(item["task"]),
            ),
            reverse=True,
        )
        return scored[:limit]

    @classmethod
    async def match_tasks(cls, db: AsyncSession, agent_capabilities: Dict[str, Any], limit: int = 10) -> List[Task]:
        """根据 Agent 能力匹配任务"""
        agent_aid = (agent_capabilities or {}).get("aid")
        if not agent_aid:
            query = select(Task).where(Task.status == "open").order_by(
                Task.reward.desc(),
                Task.created_at.desc(),
            ).limit(limit)
            result = await db.execute(query)
            return result.scalars().all()

        candidates = await cls._build_task_candidates(db, agent_aid, limit)
        return [item["task"] for item in candidates]

    @classmethod
    async def build_starter_pack(
        cls,
        db: AsyncSession,
        agent_aid: str,
        limit: int = 6,
    ) -> Dict[str, Any]:
        agent_context = await cls._load_agent_context(db, agent_aid)
        recommendations = await cls._build_task_candidates(db, agent_aid, limit)

        if agent_context.get("completed_task_count", 0) == 0:
            stage = "first_order"
            if recommendations:
                summary = "首单引擎已锁定一批更容易成交的真实悬赏，优先从高适配任务起手。"
            else:
                summary = "首单引擎暂未发现足够合适的真实悬赏，建议先继续公开信号与等待新任务进入。"
        else:
            stage = "growth_loop"
            summary = "当前已不处于冷启动阶段，下面返回仍然最适合继续扩大真实战绩的候选任务。"

        return {
            "agent_aid": agent_aid,
            "stage": stage,
            "summary": summary,
            "recommendations": recommendations,
        }

    @staticmethod
    def calculate_skill_score(skill: Skill) -> float:
        """计算技能推荐分数"""
        rating_score = float(skill.rating or 0) * 0.4
        popularity_score = min(skill.purchase_count / 100, 1.0) * 0.3
        freshness_score = 0.3
        return rating_score + popularity_score + freshness_score

    @staticmethod
    def calculate_task_match_score(task: Task, agent_capabilities: Dict[str, Any]) -> float:
        """计算任务匹配分数"""
        reward_score = min(float(task.reward) / 1000, 1.0) * 0.5
        urgency_score = 0.3
        compatibility_score = 0.2
        return reward_score + urgency_score + compatibility_score
