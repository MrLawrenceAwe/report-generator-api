from __future__ import annotations

import pytest
from sqlalchemy import select

from report_generator.db import (
    Base,
    Report,
    ReportStatus,
    Topic,
    TopicVisibility,
    User,
    create_engine_from_url,
    create_session_factory,
    session_scope,
)


def _in_memory_session_factory():
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return create_session_factory(engine)


def test_user_topic_report_relationships_round_trip():
    SessionFactory = _in_memory_session_factory()

    with session_scope(SessionFactory) as session:
        user = User(email="test@example.com", full_name="Casey Builder")
        session.add(user)
        session.flush()

        topic = Topic(
            slug="electric-vehicles",
            title="Electric Vehicle Adoption",
            description="EV adoption drivers and blockers.",
            visibility=TopicVisibility.PUBLIC,
            owner=user,
            canonical_keywords=["ev adoption", "charging"],
            tags=["mobility"],
        )
        session.add(topic)
        session.flush()

        report = Report(
            topic=topic,
            owner=user,
            status=ReportStatus.COMPLETE,
            summary="EV adoption report",
            sections={"sections": []},
            tags=["mobility"],
        )
        session.add(report)

    with session_scope(SessionFactory) as session:
        stored_user = session.scalar(select(User).where(User.email == "test@example.com"))
        assert stored_user is not None
        assert stored_user.reports
        assert stored_user.topics
        report = stored_user.reports[0]
        assert report.topic.slug == "electric-vehicles"
        assert report.status is ReportStatus.COMPLETE
        assert report.last_accessed_at is None

        report.mark_accessed()
        session.flush()

        assert report.last_accessed_at is not None


def test_session_scope_rolls_back_on_error():
    SessionFactory = _in_memory_session_factory()

    with pytest.raises(RuntimeError):
        with session_scope(SessionFactory) as session:
            session.add(User(email="rollback@example.com"))
            raise RuntimeError("trigger rollback")

    with session_scope(SessionFactory) as session:
        result = session.scalar(select(User).where(User.email == "rollback@example.com"))
        assert result is None
