from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import CHAR, TypeDecorator


class Base(DeclarativeBase):
    """Declarative base shared by all persistence models."""


class GUID(TypeDecorator):
    """Platform-agnostic GUID type storing UUIDs as native UUIDs or char(36)."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class TimestampMixin:
    """Adds ``created_at`` and ``updated_at`` columns to inheriting models."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Adds a soft-delete flag that callers can use for retention policies."""

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"
    ARCHIVED = "archived"


class User(Base, TimestampMixin):
    """Registered user capable of owning topics and generated reports."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(200))
    username: Mapped[Optional[str]] = mapped_column(String(200))
    organization_id: Mapped[Optional[str]] = mapped_column(String(64))
    role: Mapped[Optional[str]] = mapped_column(String(32))
    auth_provider: Mapped[Optional[str]] = mapped_column(String(32))
    profile: Mapped[Dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus),
        default=UserStatus.ACTIVE,
        nullable=False,
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    usage_counters: Mapped[Dict[str, int]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )

    reports: Mapped[List["Report"]] = relationship(
        back_populates="owner",
        passive_deletes=True,
    )
    saved_topics: Mapped[List["SavedTopic"]] = relationship(
        back_populates="owner",
        passive_deletes=True,
    )


class SavedTopic(Base, TimestampMixin, SoftDeleteMixin):
    """Topic saved by a user. Stores the canonical title referenced by reports."""

    __tablename__ = "saved_topics"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_saved_topics_slug"),
        Index("ix_saved_topics_owner", "owner_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    owner: Mapped[Optional[User]] = relationship(
        back_populates="saved_topics",
        passive_deletes=True,
    )
    reports: Mapped[List["Report"]] = relationship(
        back_populates="saved_topic",
        passive_deletes=True,
    )


class Report(Base, TimestampMixin, SoftDeleteMixin):
    """Generated report along with metadata for auditing and retrieval."""

    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_owner_created_at", "owner_user_id", "created_at"),
        Index("ix_reports_topic_status", "saved_topic_id", "status"),
        Index("ix_reports_publication", "status", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    saved_topic_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("saved_topics.id", ondelete="CASCADE"),
        nullable=False,
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    outline_snapshot: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        MutableDict.as_mutable(JSON)
    )
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus),
        default=ReportStatus.DRAFT,
        nullable=False,
    )
    language: Mapped[str] = mapped_column(String(16), default="en", nullable=False)
    output_format: Mapped[str] = mapped_column(String(32), default="markdown", nullable=False)
    content_uri: Mapped[Optional[str]] = mapped_column(String(500))
    summary: Mapped[Optional[str]] = mapped_column(Text)
    sections: Mapped[Dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )
    source_references: Mapped[List[Dict[str, Any]]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )
    model_versions: Mapped[Dict[str, str]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )
    quality_scores: Mapped[Dict[str, float]] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict
    )
    tags: Mapped[List[str]] = mapped_column(
        MutableList.as_mutable(JSON), default=list
    )
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        MutableList.as_mutable(JSON)
    )
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100))
    embedding_dimensions: Mapped[Optional[int]] = mapped_column(Integer)
    cost_cents: Mapped[Optional[int]] = mapped_column(Integer)
    token_count: Mapped[Optional[int]] = mapped_column(Integer)
    generated_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    generated_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_accessed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    saved_topic: Mapped[SavedTopic] = relationship(
        back_populates="reports",
        passive_deletes=True,
    )
    owner: Mapped[User] = relationship(
        back_populates="reports",
        passive_deletes=True,
    )

    def mark_accessed(self) -> None:
        """Update ``last_accessed_at`` to now for engagement tracking."""

        self.last_accessed_at = datetime.now(tz=timezone.utc)


__all__ = [
    "Base",
    "GUID",
    "Report",
    "ReportStatus",
    "SavedTopic",
    "SoftDeleteMixin",
    "TimestampMixin",
    "User",
    "UserStatus",
]
