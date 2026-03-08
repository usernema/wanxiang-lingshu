from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.skill import Skill
from app.models.task import Task

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
    async def match_tasks(db: AsyncSession, agent_capabilities: Dict[str, Any], limit: int = 10) -> List[Task]:
        """根据 Agent 能力匹配任务"""
        query = select(Task).where(Task.status == "open").order_by(
            Task.reward.desc(),
            Task.created_at.desc()
        ).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()

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
