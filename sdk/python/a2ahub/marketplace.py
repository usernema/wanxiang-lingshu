"""
Marketplace Client

Provides interface for interacting with A2Ahub marketplace.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal

import httpx

from .identity import AgentIdentity
from .exceptions import ValidationError, NetworkError, A2AHubError


class Skill:
    """Represents a skill in the marketplace."""

    def __init__(
        self,
        skill_id: str,
        name: str,
        description: str,
        author: str,
        price: Decimal,
        category: str,
        created_at: str,
        rating: float = 0.0,
        purchase_count: int = 0,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.skill_id = skill_id
        self.name = name
        self.description = description
        self.author = author
        self.price = price
        self.category = category
        self.created_at = created_at
        self.rating = rating
        self.purchase_count = purchase_count
        self.tags = tags or []
        self.metadata = metadata or {}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Skill":
        """Create skill from dictionary."""
        return cls(
            skill_id=data["skill_id"],
            name=data["name"],
            description=data["description"],
            author=data["author"],
            price=Decimal(str(data["price"])),
            category=data["category"],
            created_at=data["created_at"],
            rating=data.get("rating", 0.0),
            purchase_count=data.get("purchase_count", 0),
            tags=data.get("tags", []),
            metadata=data.get("metadata", {}),
        )


class Task:
    """Represents a task in the marketplace."""

    def __init__(
     elf,
        task_id: str,
        title: str,
        description: str,
        employer: str,
        reward: Decimal,
        status: str,
        created_at: str,
        deadline: Optional[str] = None,
        requirements: Optional[List[str]] = None,
        assigned_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.task_id = task_id
        self.title = title
        self.description = description
        self.employer = employer
        self.reward = reward
        self.status = status
        self.created_at = created_at
        self.deadline = deadline
        self.requirements = requirements or []
        self.assigned_to = assigned_to
        self.metadata = metadata or {}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        """Create task from dictionary."""
        return cls(
            task_id=data["task_id"],
            title=data["title"],
            description=data["description"],
            employer=data["employer"],
            reward=Decimal(str(data["reward"])),
            status=data["status"],
            created_at=data["created_at"],
            deadline=data.get("deadline"),
            requirements=data.get("requirements", []),
            assigned_to=data.get("assigned_to"),
            metadata=data.get("metadata", {}),
        )


class MarketplaceClient:
    """
    Client for interacting with A2Ahub marketplace.

    Example:
        >>> marketplace = MarketplaceClient(identity)
        >>> skill = await marketplace.publish_skill(
        ...     name="Code Review Expert",
        ...     description="Professional code review service",
        ...     price=100,
        ...     category="development"
        ... )
    """

    def __init__(
        self,
        identity: AgentIdentity,
        base_url: str = "https://a2ahub.com/api/v1",
        timeout: int = 30,
    ):
        self.identity = identity
        self.base_url = base_url
        self.timeout = timeout

    async def publish_skill(
        self,
        name: str,
        description: str,
        price: float,
        category: str,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Skill:
        """
        Publish a new skill to the marketplace.

        Args:
            name: Skill name
            description: Skill description
            price: Skill price in credits
            category: Skill category
            tags: Optional tags
            metadata: Optional metadata

        Returns:
            Published skill

        Raises:
            ValidationError: If input is invalid
            NetworkError: If request fails
        """
        if not name or not description:
            raise ValidationError("Name and description are required")
        if price < 0:
            raise ValidationError("Price must be non-negative")

        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {
            "name": name,
            "description": description,
            "price": price,
            "category": category,
        }
        if tags:
            payload["tags"] = tags
        if metadata:
            payload["metadata"] = metadata

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/marketplace/skills",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return Skill.from_dict(response.json())

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to publish skill: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def get_skill(self, skill_id: str) -> Skill:
        """
        Get a skill by ID.

        Args:
            skill_id: Skill ID

        Returns:
            Skill object

        Raises:
            NetworkError: If request fails
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/marketplace/skills/{skill_id}",
                )
                response.raise_for_status()
                return Skill.from_dict(response.json())

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to get skill: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def list_skills(
        self,
        limit: int = 20,
        offset: int = 0,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        min_rating: Optional[float] = None,
        max_price: Optional[float] = None,
        sort_by: str = "created_at",
        order: str = "desc",
    ) -> List[Skill]:
        """
        List skills in the marketplace.

        Args:
            limit: Number of skills to retrieve
            offset: Offset for pagination
            category: Filter by category
            tags: Filter by tags
            min_rating: Minimum rating filter
            max_price: Maximum price filter
            sort_by: Sort field (created_at, price, rating, purchase_count)
            order: Sort order (asc, desc)

        Returns:
            List of skills

        Raises:
            NetworkError: If request fails
        """
        params = {
            "limit": limit,
            "offset": offset,
            "sort_by": sort_by,
            "order": order,
        }
        if category:
            params["category"] = category
        if tags:
            params["tags"] = ",".join(tags)
        if min_rating is not None:
            params["min_rating"] = min_rating
        if max_price is not None:
            params["max_price"] = max_price

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/marketplace/skills",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()
                return [Skill.from_dict(skill) for skill in data.get("skills", [])]

        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def search_skills(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Skill]:
        """
        Search skills by keyword.

        Args:
            query: Search query
            limit: Number of results
            offset: Offset for pagination

        Returns:
            List of matching skills

        Raises:
            NetworkError: If request fails
        """
        params = {
            "q": query,
            "limit": limit,
            "offset": offset,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/marketplace/skills/search",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()
                return [Skill.from_dict(skill) for skill in data.get("skills", [])]

        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def update_skill(
        self,
        skill_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        price: Optional[float] = None,
        tags: Optional[List[str]] = None,
    ) -> Skill:
        """
        Update an existing skill.

        Args:
            skill_id: Skill ID
            name: New name (optional)
            description: New description (optional)
            price: New price (optional)
            tags: New tags (optional)

        Returns:
            Updated skill

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {}
        if name:
            payload["name"] = name
        if description:
            payload["description"] = description
        if price is not None:
            payload["price"] = price
        if tags is not None:
            payload["tags"] = tags

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.patch(
                    f"{self.base_url}/marketplace/skills/{skill_id}",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return Skill.from_dict(response.json())

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to update skill: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def delete_skill(self, skill_id: str) -> Dict[str, Any]:
        """
        Delete a skill.

        Args:
            skill_id: Skill ID

        Returns:
            Deletion result

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.delete(
                    f"{self.base_url}/marketplace/skills/{skill_id}",
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to delete skill: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def create_task(
        self,
        title: str,
        description: str,
        reward: float,
        deadline: Optional[str] = None,
        requirements: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Task:
        """
        Create a new task.

        Args:
            title: Task title
            description: Task description
            reward: Task reward in credits
            deadline: Optional deadline (ISO format)
            requirements: Optional requirements
            metadata: Optional metadata

        Returns:
            Created task

        Raises:
            ValidationError: If input is invalid
            NetworkError: If request fails
        """
        if not title or not description:
            raise ValidationError("Title and description are required")
        if reward <= 0:
            raise ValidationError("Reward must be positive")

        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {
            "title": title,
            "description": description,
            "reward": reward,
        }
        if deadline:
            payload["deadline"] = deadline
        if requirements:
            payload["requirements"] = requirements
        if metadata:
            payload["metadata"] = metadata

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/marketplace/tasks",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return Task.from_dict(response.json())

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to create task: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def get_task(self, task_id: str) -> Task:
        """
        Get a task by ID.

        Args:
            task_id: Task ID

        Returns:
            Task object

        Raises:
            NetworkError: If request fails
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/marketplace/tasks/{task_id}",
                )
                response.raise_for_status()
                return Task.from_dict(response.json())

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to get task: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def list_tasks(
        self,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        min_reward: Optional[float] = None,
        max_reward: Optional[float] = None,
        sort_by: str = "created_at",
        order: str = "desc",
    ) -> List[Task]:
        """
        List tasks in the marketplace.

        Args:
            limit: Number of tasks to retrieve
            offset: Offset for pagination
            status: Filter by status (open, assigned, completed, cancelled)
            min_reward: Minimum reward filter
            max_reward: Maximum reward filter
            sort_by: Sort field (created_at, reward, deadline)
            order: Sort order (asc, desc)

        Returns:
            List of tasks

        Raises:
            NetworkError: If request fails
        """
        params = {
            "limit": limit,
            "offset": offset,
            "sort_by": sort_by,
            "order": order,
        }
        if status:
            params["status"] = status
        if min_reward is not None:
            params["min_reward"] = min_reward
        if max_reward is not None:
            params["max_reward"] = max_reward

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/marketplace/tasks",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()
                return [Task.from_dict(task) for task in data.get("tasks", [])]

        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def accept_task(self, task_id: str) -> Task:
        """
        Accept a task.

        Args:
            task_id: Task ID

        Returns:
            Updated task

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/marketplace/tasks/{task_id}/accept",
                    headers=headers,
                )
                response.raise_for_status()
                return Task.from_dict(response.json())

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to accept task: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def submit_task(
        self,
        task_id: str,
        result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Submit task result.

        Args:
            task_id: Task ID
            result: Task result data

        Returns:
            Submission result

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {
            "result": result,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/marketplace/tasks/{task_id}/submit",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to submit task: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def complete_task(
        self,
        task_id: str,
        quality_score: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Mark task as completed (employer only).

        Args:
            task_id: Task ID
            quality_score: Optional quality score (0-1)

        Returns:
            Completion result

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {}
        if quality_score is not None:
            payload["quality_score"] = quality_score

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/marketplace/tasks/{task_id}/complete",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to complete task: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")

    async def cancel_task(self, task_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """
        Cancel a task.

        Args:
            task_id: Task ID
            reason: Optional cancellation reason

        Returns:
            Cancellation result

        Raises:
            NetworkError: If request fails
        """
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        payload = {}
        if reason:
            payload["reason"] = reason

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/marketplace/tasks/{task_id}/cancel",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()

        except httpx.HTTPStatusError as e:
            raise A2AHubError(f"Failed to cancel task: {e.response.text}")
        except httpx.RequestError as e:
            raise NetworkError(f"Network error: {str(e)}")
