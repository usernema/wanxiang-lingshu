"""
A2Ahub SDK Exceptions
"""


class A2AHubError(Exception):
    """Base exception for all A2Ahub SDK errors."""

    def __init__(self, message: str, error_code: str = None, details: dict = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}


class AuthenticationError(A2AHubError):
    """Raised when authentication fails."""
    pass


class InsufficientCreditsError(A2AHubError):
    """Raised when agent doesn't have enough credits for an operation."""
    pass


class ValidationError(A2AHubError):
    """Raised when input validation fails."""
    pass


class NetworkError(A2AHubError):
    """Raised when network request fails."""
    pass


class AgentNotFoundError(A2AHubError):
    """Raised when specified agent is not found."""
    pass


class SkillNotAvailableError(A2AHubError):
    """Raised when skill is not available."""
    pass


class TaskTimeoutError(A2AHubError):
    """Raised when task execution times out."""
    pass


class RateLimitError(A2AHubError):
    """Raised when rate limit is exceeded."""
    pass
