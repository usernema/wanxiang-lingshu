"""
Tests for AgentCommunicator
"""

import pytest
from a2ahub.identity import AgentIdentity
from a2ahub.communicator import AgentCommunicator, Message


class TestMessage:
    """Test cases for Message class."""

    def test_create_message(self):
        """Test creating a message."""
        msg = Message(
            from_aid="agent://a2ahub/sender",
            to_aid="agent://a2ahub/receiver",
            msg_type="request",
            intent="task.execute",
            content={"task": "test"},
        )

        assert msg.from_aid == "agent://a2ahub/sender"
        assert msg.to_aid == "agent://a2ahub/receiver"
        assert msg.type == "request"
        assert msg.intent == "task.execute"
        assert msg.content == {"task": "test"}
        assert msg.message_id is not None
        assert msg.conversation_id is not None

    def test_message_to_dict(self):
        """Test converting message to dictionary."""
        msg = Message(
            from_aid="agent://a2ahub/sender",
            to_aid="agent://a2ahub/receiver",
            msg_type="request",
            intent="task.execute",
            content={"task": "test"},
        )

        data = msg.to_dict()

        assert data["from"] == "agent://a2ahub/sender"
        assert data["to"] == "agent://a2ahub/receiver"
        assert data["type"] == "request"
        assert data["intent"] == "task.execute"
        assert data["content"] == {"task": "test"}

    def test_message_from_dict(self):
        """Test creating message from dictionary."""
        data = {
            "message_id": "msg_123",
            "conversation_id": "conv_456",
            "from": "agent://a2ahub/sender",
            "to": "agent://a2ahub/receiver",
            "type": "response",
            "intent": "task.result",
            "content": {"result": "success"},
            "timestamp": "2026-03-08T10:00:00Z",
        }

        msg = Message.from_dict(data)

        assert msg.message_id == "msg_123"
        assert msg.conversation_id == "conv_456"
        assert msg.from_aid == "agent://a2ahub/sender"
        assert msg.to_aid == "agent://a2ahub/receiver"
        assert msg.type == "response"
        assert msg.intent == "task.result"
        assert msg.content == {"result": "success"}


@pytest.mark.asyncio
class TestAgentCommunicator:
    """Test cases for AgentCommunicator class."""

    @pytest.fixture
    def identity(self):
        """Create test identity."""
        identity = AgentIdentity.create(
            model="claude-opus-4-6",
            provider="anthropic",
        )
        identity.aid = "agent://a2ahub/test-abc123"
        return identity

    @pytest.fixture
    def communicator(self, identity):
        """Create test communicator."""
        return AgentCommunicator(identity)

    def test_create_communicator(self, identity):
        """Test creating a communicator."""
        comm = AgentCommunicator(identity)

        assert comm.identity == identity
        assert comm.base_url == "https://a2ahub.com/api/v1"
        assert comm.timeout == 30

    def test_sign_message(self, communicator):
        """Test signing a message."""
        msg = Message(
            to_aid="agent://a2ahub/receiver",
            msg_type="request",
            intent="test",
            content={},
        )

        signed_msg = communicator._sign_message(msg)

        assert signed_msg.from_aid == communicator.identity.aid
        assert signed_msg.signature is not None
        assert len(signed_msg.signature) > 0

    def test_event_handler_registration(self, communicator):
        """Test registering event handlers."""
        handler_called = []

        def handler(message):
            handler_called.append(message)

        communicator.on("skill.published", handler)

        assert "skill.published" in communicator._event_handlers
        assert handler in communicator._event_handlers["skill.published"]

    async def test_handle_message(self, communicator):
        """Test handling incoming messages."""
        handler_called = []

        async def handler(message):
            handler_called.append(message)

        communicator.on("test.intent", handler)

        msg = Message(
            from_aid="agent://a2ahub/sender",
            msg_type="notification",
            intent="test.intent",
            content={"data": "test"},
        )

        await communicator._handle_message(msg)

        assert len(handler_called) == 1
        assert handler_called[0].intent == "test.intent"
