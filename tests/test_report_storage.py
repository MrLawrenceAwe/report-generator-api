from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from backend.db import (
    Base,
    Report,
    ReportStatus,
    SavedTopic,
    User,
    create_engine_from_url,
    create_session_factory,
    session_scope,
)
from backend.schemas import GenerateRequest, Outline, Section
from backend.storage import GeneratedReportStore


def _session_factory():
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return create_session_factory(engine)


def test_generated_report_store_persists_artifacts(tmp_path: Path):
    session_factory = _session_factory()
    store = GeneratedReportStore(base_dir=tmp_path / "reports", session_factory=session_factory)
    outline = Outline(
        report_title="Solar Energy Growth",
        sections=[Section(title="1: Introduction", subsections=["1.1: Framing"])],
    )
    request = GenerateRequest.model_validate(
        {
            "topic": "Solar energy expansion",
            "mode": "generate_report",
            "owner_email": "owner@example.com",
            "owner_username": "owner-example",
        }
    )

    handle = store.prepare_report(request, outline)
    assert handle.outline_path.exists()

    narration = "Solar Energy Growth\n\n1: Introduction\n\n1.1: Framing\n\nDetailed body."
    sections = [{"title": "1: Introduction", "body": "1.1: Framing"}]
    store.finalize_report(handle, narration, sections)

    assert handle.narrative_path.read_text(encoding="utf-8").strip().startswith("Solar Energy Growth")

    with session_scope(session_factory) as session:
        stored = session.get(Report, handle.report_id)
        assert stored is not None
        assert stored.status is ReportStatus.COMPLETE
        assert stored.summary is None
        assert stored.content_uri.endswith("report.md")
        assert stored.sections["written"][0]["title"] == "1: Introduction"


def test_generated_report_store_discards_failed_reports(tmp_path: Path):
    session_factory = _session_factory()
    store = GeneratedReportStore(base_dir=tmp_path / "reports", session_factory=session_factory)
    outline = Outline(report_title="Failure Case", sections=[])
    request = GenerateRequest.model_validate(
        {
            "topic": "Failure topic",
            "mode": "generate_report",
        }
    )

    handle = store.prepare_report(request, outline)
    store.discard_report(handle)

    with session_scope(session_factory) as session:
        stored = session.get(Report, handle.report_id)
        assert stored is None
    assert not handle.report_dir.exists()


def test_prepare_report_marks_failed_when_outline_snapshot_write_breaks(tmp_path: Path, monkeypatch):
    session_factory = _session_factory()
    store = GeneratedReportStore(base_dir=tmp_path / "reports", session_factory=session_factory)
    outline = Outline(report_title="Outline Failure", sections=[])
    request = GenerateRequest.model_validate(
        {
            "topic": "Outline failure topic",
            "mode": "generate_report",
        }
    )

    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(store, "_write_outline_snapshot", boom)
    with pytest.raises(OSError):
        store.prepare_report(request, outline)

    with session_scope(session_factory) as session:
        report = session.scalar(select(Report))
        assert report is None


def test_prepare_report_uses_owner_username_for_custom_users(tmp_path: Path):
    session_factory = _session_factory()
    store = GeneratedReportStore(base_dir=tmp_path / "reports", session_factory=session_factory)
    outline = Outline(report_title="Custom Owner", sections=[])
    request = GenerateRequest.model_validate(
        {
            "topic": "Custom owner topic",
            "mode": "generate_report",
            "owner_email": "custom@example.com",
            "owner_username": "Custom Owner",
        }
    )

    handle = store.prepare_report(request, outline)
    with session_scope(session_factory) as session:
        user = session.get(User, handle.owner_user_id)
        assert user is not None
        assert user.full_name == "Custom Owner"
        assert user.username == "Custom Owner"


def test_prepare_report_replaces_placeholder_names(tmp_path: Path):
    session_factory = _session_factory()
    store = GeneratedReportStore(base_dir=tmp_path / "reports", session_factory=session_factory)
    outline = Outline(report_title="Rename Owner", sections=[])

    placeholder_email = "owner@example.com"
    with session_scope(session_factory) as session:
        user = User(email=placeholder_email, full_name="Explorer System", username="Explorer System")
        session.add(user)
        session.flush()

    request = GenerateRequest.model_validate(
        {
            "topic": "Renaming topic",
            "mode": "generate_report",
            "owner_email": placeholder_email,
            "owner_username": "Real Owner",
        }
    )

    store.prepare_report(request, outline)

    with session_scope(session_factory) as session:
        user = session.scalar(select(User).where(User.email == placeholder_email))
        assert user is not None
        assert user.full_name == "Real Owner"
        assert user.username == "Real Owner"


def _fetch_saved_topic(session_factory, report_id):
    with session_scope(session_factory) as session:
        report = session.get(Report, report_id)
        assert report is not None, "Report row missing"
        topic = session.get(SavedTopic, report.saved_topic_id)
        assert topic is not None, "Saved topic missing"
        return topic


def test_prepare_report_trims_request_topic_titles(tmp_path: Path):
    session_factory = _session_factory()
    store = GeneratedReportStore(
        base_dir=tmp_path / "reports", session_factory=session_factory
    )
    outline = Outline(report_title="Outline Title", sections=[])
    request = GenerateRequest.model_validate(
        {
            "topic": "   Solar storage growth   ",
            "mode": "generate_report",
        }
    )

    handle = store.prepare_report(request, outline)
    topic = _fetch_saved_topic(session_factory, handle.report_id)
    assert topic.title == "Solar storage growth"


def test_prepare_report_limits_outline_title_length(tmp_path: Path):
    session_factory = _session_factory()
    store = GeneratedReportStore(
        base_dir=tmp_path / "reports", session_factory=session_factory
    )
    long_title = "A" * 300
    outline = Outline(report_title=long_title, sections=[])
    request = GenerateRequest.model_validate(
        {
            "outline": outline.model_dump(),
            "return": "report",
        }
    )

    handle = store.prepare_report(request, outline)
    topic = _fetch_saved_topic(session_factory, handle.report_id)
    assert topic.title == long_title[:255]
