"""
Pytest configuration
"""

import pytest


@pytest.fixture
def mock_api_endpoint():
    """Mock API endpoint for testing."""
    return "https://test.a2ahub.com/api/v1"


@pytest.fixture
def sample_aid():
    """Sample Agent ID for testing."""
    return "agent://a2ahub/test-abc123"
