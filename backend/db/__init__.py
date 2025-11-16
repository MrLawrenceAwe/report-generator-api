"""
Database access layer exposing SQLAlchemy models and session helpers.

This module centralizes imports so application code can simply consume
``backend.db`` to work with the persistence layer.
"""

from .models import (
    Base,
    Report,
    ReportStatus,
    Topic,
    TopicVisibility,
    User,
    UserStatus,
)
from .session import (
    create_engine_from_url,
    create_session_factory,
    session_scope,
)

__all__ = [
    "Base",
    "Report",
    "ReportStatus",
    "Topic",
    "TopicVisibility",
    "User",
    "UserStatus",
    "create_engine_from_url",
    "create_session_factory",
    "session_scope",
]
