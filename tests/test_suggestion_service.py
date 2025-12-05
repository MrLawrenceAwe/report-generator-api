from __future__ import annotations

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
from backend.schemas import SuggestionsRequest
from backend.services.suggestion_service import SuggestionService


def _session_factory():
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return create_session_factory(engine)


def test_load_report_headings_collects_all_subsections():
    session_factory = _session_factory()
    with session_scope(session_factory) as session:
        user = User(email="seed@example.com", full_name="Seeder", username="Seeder")
        session.add(user)
        session.flush()
        topic = SavedTopic(slug="topic", title="Topic", owner=user)
        session.add(topic)
        session.flush()
        report = Report(
            saved_topic=topic,
            owner=user,
            status=ReportStatus.COMPLETE,
            sections={
                "outline": {
                    "sections": [
                        {"title": "Section One", "subsections": ["First A", "First B"]},
                        {"title": "Section Two", "subsections": ["Second A"]},
                    ]
                }
            },
        )
        session.add(report)

    service = SuggestionService(text_client=object(), session_factory=session_factory)
    request = SuggestionsRequest.model_validate({"include_report_headings": True})

    seeds = service._collect_seeds(request)

    assert "Section One" in seeds
    assert "Section Two" in seeds
    assert "First A" in seeds
    assert "First B" in seeds
    assert "Second A" in seeds
