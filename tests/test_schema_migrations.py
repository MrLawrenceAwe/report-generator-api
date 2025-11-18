from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import inspect, text

from backend.db.models import Base
from backend.db.schema_migrations import ensure_lightweight_schema
from backend.db.session import create_engine_from_url


def _legacy_sqlite_url(db_path: Path) -> str:
    return f"sqlite:///{db_path}"


def test_ensure_lightweight_schema_rebuilds_legacy_tables(tmp_path: Path):
    db_path = tmp_path / "legacy.db"
    engine = create_engine_from_url(_legacy_sqlite_url(db_path))
    _create_legacy_schema(engine)

    ensure_lightweight_schema(engine)
    Base.metadata.create_all(engine)

    inspector = inspect(engine)
    user_columns = [column["name"] for column in inspector.get_columns("users")]
    assert user_columns == [
        "id",
        "email",
        "password_hash",
        "full_name",
        "username",
        "organization_id",
        "role",
        "auth_provider",
        "profile",
        "status",
        "last_login_at",
        "usage_counters",
        "created_at",
        "updated_at",
    ]

    report_columns = [column["name"] for column in inspector.get_columns("reports")]
    assert report_columns == [
        "id",
        "saved_topic_id",
        "owner_user_id",
        "outline_snapshot",
        "status",
        "language",
        "output_format",
        "content_uri",
        "summary",
        "sections",
        "source_references",
        "model_versions",
        "quality_scores",
        "tags",
        "embedding",
        "embedding_model",
        "embedding_dimensions",
        "cost_cents",
        "token_count",
        "generated_started_at",
        "generated_completed_at",
        "published_at",
        "last_accessed_at",
        "created_at",
        "updated_at",
        "is_deleted",
    ]

    with engine.connect() as conn:
        row = conn.execute(text("SELECT email, full_name, username FROM users")).one()
        assert row.username == row.full_name == "Legacy Owner"


def _create_legacy_schema(engine):
    user_id = str(uuid.uuid4())
    topic_id = str(uuid.uuid4())
    report_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE users (
                id CHAR(36) PRIMARY KEY,
                email VARCHAR(320) NOT NULL,
                password_hash VARCHAR(255),
                full_name VARCHAR(200),
                organization_id VARCHAR(64),
                role VARCHAR(32),
                auth_provider VARCHAR(32),
                profile JSON,
                status VARCHAR(32) NOT NULL,
                last_login_at DATETIME,
                usage_counters JSON,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                is_deleted BOOLEAN NOT NULL
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE saved_topics (
                id CHAR(36) PRIMARY KEY,
                slug VARCHAR(255) NOT NULL,
                title VARCHAR(255) NOT NULL,
                owner_user_id CHAR(36) NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                is_deleted BOOLEAN NOT NULL,
                FOREIGN KEY(owner_user_id) REFERENCES users(id)
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE reports (
                id CHAR(36) PRIMARY KEY,
                saved_topic_id CHAR(36) NOT NULL,
                owner_user_id CHAR(36) NOT NULL,
                outline_snapshot JSON,
                status VARCHAR(32) NOT NULL,
                language VARCHAR(16) NOT NULL,
                output_format VARCHAR(32) NOT NULL,
                content_uri VARCHAR(500),
                summary TEXT,
                sections JSON,
                source_references JSON,
                model_versions JSON,
                quality_scores JSON,
                tags JSON,
                embedding JSON,
                embedding_model VARCHAR(100),
                embedding_dimensions INTEGER,
                cost_cents INTEGER,
                token_count INTEGER,
                generated_started_at DATETIME,
                generated_completed_at DATETIME,
                published_at DATETIME,
                last_accessed_at DATETIME,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                is_deleted BOOLEAN NOT NULL,
                FOREIGN KEY(saved_topic_id) REFERENCES saved_topics(id),
                FOREIGN KEY(owner_user_id) REFERENCES users(id)
            )
            """
        )

        conn.exec_driver_sql(
            """
            INSERT INTO users (
                id, email, password_hash, full_name, organization_id, role,
                auth_provider, profile, status, last_login_at, usage_counters,
                created_at, updated_at, is_deleted
            )
            VALUES (
                ?, 'legacy@example.com', NULL, 'Legacy Owner', NULL, NULL,
                NULL, NULL, 'active', NULL, NULL, CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP, 0
            )
            """,
            (user_id,),
        )
        conn.exec_driver_sql(
            """
            INSERT INTO saved_topics (
                id, slug, title, owner_user_id, created_at, updated_at, is_deleted
            )
            VALUES (
                ?, 'legacy-topic', 'Legacy Topic', ?, CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP, 0
            )
            """,
            (topic_id, user_id),
        )
        conn.exec_driver_sql(
            """
            INSERT INTO reports (
                id, saved_topic_id, owner_user_id, outline_snapshot, status,
                language, output_format, content_uri, summary, sections,
                source_references, model_versions, quality_scores, tags,
                embedding, embedding_model, embedding_dimensions, cost_cents,
                token_count, generated_started_at, generated_completed_at,
                published_at, last_accessed_at, created_at, updated_at, is_deleted
            )
            VALUES (
                ?, ?, ?, NULL, 'complete', 'en', 'markdown', NULL, NULL, '{}',
                '[]', '{}', '{}', '[]', NULL, NULL, NULL, NULL, NULL,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0
            )
            """,
            (report_id, topic_id, user_id),
        )
