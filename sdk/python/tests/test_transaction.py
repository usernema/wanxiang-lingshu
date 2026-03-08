"""
Tests for TransactionManager
"""

import pytest
from decimal import Decimal

from a2ahub.identity import AgentIdentity
from a2ahub.transaction import TransactionManager, Transaction, Balance
from a2ahub.exceptions import ValidationError, InsufficientCreditsError


class TestTransaction:
    """Test cases for Transaction class."""

    def test_create_transaction(self):
        """Test creating a transaction."""
        tx = Transaction(
            transaction_id="tx_123",
            transaction_type="credit_transfer",
            from_aid="agent://a2ahub/sender",
            to_aid="agent://a2ahub/receiver",
            amount=Decimal("100.00"),
            status="completed",
            timestamp="2026-03-08T10:00:00Z",
        )

        assert tx.transaction_id == "tx_123"
        assert tx.type == "credit_transfer"
        assert tx.amount == Decimal("100.00")
        assert tx.status == "completed"

    def test_transaction_from_dict(self):
        """Test creating transaction from dictionary."""
        data = {
            "transaction_id": "tx_123",
            "type": "credit_transfer",
            "from": "agent://a2ahub/sender",
            "to": "agent://a2ahub/receiver",
            "amount": 100.50,
            "fee": 10.05,
            "status": "completed",
            "timestamp": "2026-03-08T10:00:00Z",
        }

        tx = Transaction.from_dict(data)

        assert tx.transaction_id == "tx_123"
        assert tx.amount == Decimal("100.50")
        assert tx.fee == Decimal("10.05")


class TestBalance:
    """Test cases for Balance class."""

    def test_create_balance(self):
        """Test creating a balance."""
        balance = Balance(
            available=Decimal("1000.00"),
            frozen=Decimal("100.00"),
            total_earned=Decimal("5000.00"),
            total_spent=Decimal("4100.00"),
        )

        assert balance.available == Decimal("1000.00")
        assert balance.frozen == Decimal("100.00")
        assert balance.total == Decimal("1100.00")


@pytest.mark.asyncio
class TestTransactionManager:
    """Test cases for TransactionManager class."""

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
    def tx_manager(self, identity):
        """Create test transaction manager."""
        return TransactionManager(identity)

    def test_create_transaction_manager(self, identity):
        """Test creating a transaction manager."""
        tx_manager = TransactionManager(identity)

        assert tx_manager.identity == identity
        assert tx_manager.base_url == "https://a2ahub.com/api/v1"

    async def test_transfer_validation(self, tx_manager):
        """Test transfer input validation."""
        with pytest.raises(ValidationError):
            await tx_manager.transfer(
                to="agent://a2ahub/receiver",
                amount=0,  # Invalid amount
            )

        with pytest.raises(ValidationError):
            await tx_manager.transfer(
                to="agent://a2ahub/receiver",
                amount=-100,  # Negative amount
            )
