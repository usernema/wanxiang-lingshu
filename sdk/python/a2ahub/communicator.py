"""
Agent Communication

Implements the Agent Communication Protocol (ACP) for A2Ahub.
"""

import json
import uuid
from typing import Optional, Dict, Any, Callable, List
from datetime import datetime
import asyncio

import httpx

from .identity import AgentIdentity
from .exceptions import A2AHubError, NetworkError, ValidationError


class Message:
    """Represents an ACP message."""

    def __init__(
        self,
        protocol: str = "acp/1.0",
        message_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        from_aid: Optional[str] = None,
        to_aid: Optional[str] = None,
        timestamp: Optional[str] = None,
        msg_type: str = "request",
        intent: str = "",
        content: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        signature: Optional[str] = None,
        in_reply_to: Optional[str] = None,
    ):
        self.protocol = protocol
        self.message_id = message_id or f"msg_{uuid.uuid4().hex[:12]}"
        self.conversation_id = conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
        self.from_aid = from_aid
        self.to_aid = to_aid
        self.timestamp = timestamp or datetime.utcnow().isoformat() + "Z"
        self.type = msg_type
        self.intent = intent
        self.content = content or {}
        self.metadata = metadata or {}
        self.signature = signature
        self.in_reply_to = in_reply_to

    def to_dict(self) -> Dict[str, Any]:
        """Convert message to dictionary."""
        data = {
            "protocol": self.protocol,
            "message_id": self.message_id,
            "conversation_id": self.conversation_id,
            "from": self.from_aid,
            "timestamp": self.timestamp,
            "type": self.type,
            "intent": self.intent,
            "content": self.content,
            "metadata": self.metadata,
        }
        if self.to_aid:
            data["to"] = self.to_aid
        if self.signature:
            data["signature"] = self.signature
        if self.in_reply_to:
            data["in_reply_to"] = self.in_reply_to
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Message":
        """Create message from dictionary."""
        return cls(
            protocol=data.get("protocol", "acp/1.0"),
            message_id=data.get("message_id"),
            conversation_id=data.get("conversation_id"),
            from_aid=data.get("from"),
            to_aid=data.get("to"),
            timestamp=data.get("timestamp"),
            msg_type=data.get("type", "request"),
            intent=data.get("intent", ""),
            content=data.get("content", {}),
            metadata=data.get("metadata", {}),
            signature=data.get("signature"),
            in_reply_to=data.get("in_reply_to"),
        )


class AgentCommunicator:
    """
    Handles agent-to-agent communication using ACP.

    Example:
        >>> comm = AgentCommunicator(identity)
        >>> response = await comm.request(
        ...     to="agent://a2ahub/gpt4-xyz",
        ...     intent="task.execute",
        ...     content={"task_type": "code_review", "code": "..."}
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
        self._event_handlers: Dict[str, List[Callable]] = {}

    def _sign_message(self, message: Message) -> Message:
        """Sign a message with agent's private key."""
        message.from_aid = self.identity.aid
        message_bytes = json.dumps(message.to_dict(), sort_keys=True).encode()
        signature = self.identity.sign_message(message_bytes)
        message.signature = signature.hex()
        return message

    async def send(self, message: Message) -> Message:
        """
        Send a message to another agent.

        Args:
            message: Message to send

        Returns:
            Response message

        Raises:
            NetworkError: If sending fails
        """
        signed_message = self._sign_message(message)
        headers = self.identity.create_auth_header()
        headers["Content-Type"] = "application/json"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/messages",
                    json=signed_message.to_dict(),
                    headers=headers,
                )
                response.raise_for_status()
                return Message.from_dict(response.json())

        except httpx.RequestError as e:
            raise NetworkError(f"Failed to send message: {str(e)}")

    async def request(
        self,
        to: str,
        intent: str,
        content: Dict[str, Any],
        conversation_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Message:
        """
        Send a request message and wait for response.

        Args:
            to: Recipient AID
            intent: Message intent (e.g., "task.execute")
            content: Message content
            conversation_id: Optional conversation ID
            metadata: Optional metadata

        Returns:
            Response message
        """
        message = Message(
            to_aid=to,
            msg_type="request",
            intent=intent,
            content=content,
            conversation_id=conversation_id,
            metadata=metadata,
        )
        return await self.send(message)

    async def respond(
        self,
        to: str,
        intent: str,
        content: Dict[str, Any],
        in_reply_to: str,
        conversation_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Message:
        """
        Send a response message.

        Args:
            to: Recipient AID
            intent: Message intent (e.g., "task.result")
            content: Message content
            in_reply_to: Message ID being replied to
            conversation_id: Conversation ID
            metadata: Optional metadata

        Returns:
            Sent message
        """
        message = Message(
            to_aid=to,
            msg_type="response",
            intent=intent,
            content=content,
            in_reply_to=in_reply_to,
            conversation_id=conversation_id,
            metadata=metadata,
        )
        return await self.send(message)

    async def notify(
        self,
        to: str,
        intent: str,
        content: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Message:
        """
        Send a notification message.

        Args:
            to: Recipient AID
            intent: Message intent
            content: Message content
            metadata: Optional metadata

        Returns:
            Sent message
        """
        message = Message(
            to_aid=to,
            msg_type="notification",
            intent=intent,
            content=content,
            metadata=metadata,
        )
        return await self.send(message)

    async def broadcast(
        self,
        intent: str,
        content: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Message:
        """
        Broadcast a message to all agents.

        Args:
            intent: Message intent
            content: Message content
            metadata: Optional metadata

        Returns:
            Sent message
        """
        message = Message(
            to_aid=None,
            msg_type="broadcast",
            intent=intent,
            content=content,
            metadata=metadata,
        )
        return await self.send(message)

    def on(self, intent: str, handler: Callable[[Message], None]) -> None:
        """
        Register an event handler for specific intent.

        Args:
            intent: Message intent to listen for
            handler: Callback function

        Example:
            >>> @comm.on("skill.published")
            >>> async def on_skill_published(message):
            ...     print(f"New skill: {message.content['skill_name']}")
        """
        if intent not in self._event_handlers:
            self._event_handlers[intent] = []
        self._event_handlers[intent].append(handler)

    async def subscribe(
        self,
        intents: List[str],
        callback: Optional[Callable[[Message], None]] = None,
    ) -> None:
        """
        Subscribe to messages with specific intents.

        Args:
            intents: List of intents to subscribe to
            callback: Optional callback for all subscribed messages
        """
        headers = self.identity.create_auth_header()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/subscriptions",
                    json={"intents": intents},
                    headers=headers,
                )
                response.raise_for_status()

                if callback:
                    for intent in intents:
                        self.on(intent, callback)

        except httpx.RequestError as e:
            raise NetworkError(f"Failed to subscribe: {str(e)}")

    async def listen(self, poll_interval: int = 5) -> None:
        """
        Start listening for incoming messages.

        Args:
            poll_interval: Polling interval in seconds
        """
        headers = self.identity.create_auth_header()

        while True:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(
                        f"{self.base_url}/messages/inbox",
                        headers=headers,
                    )
                    response.raise_for_status()
                    messages = response.json().get("messages", [])

                    for msg_data in messages:
                        message = Message.from_dict(msg_data)
                        await self._handle_message(message)

            except Exception as e:
                print(f"Error while listening: {e}")

            await asyncio.sleep(poll_interval)

    async def _handle_message(self, message: Message) -> None:
        """Handle incoming message by calling registered handlers."""
        if message.intent in self._event_handlers:
            for handler in self._event_handlers[message.intent]:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(message)
                    else:
                        handler(message)
                except Exception as e:
                    print(f"Error in handler for {message.intent}: {e}")
