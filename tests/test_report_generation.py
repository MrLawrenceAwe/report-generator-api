import asyncio
import json
import os
import sys
import threading
import time
import uuid
from pathlib import Path

import httpx
import pytest
import uvicorn

sys.path.append(str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from app import app, get_report_service
from backend.schemas import (
    DEFAULT_TEXT_MODEL,
    GenerateRequest,
    Outline,
    Section,
)
from backend.services.outline_service import OutlineService
from backend.services.report_service import ReportGeneratorService
from backend.storage.report_store import StoredReportHandle


class StubTextClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    async def call_text_async(self, model_spec, system_prompt, user_prompt, style_hint=None):
        self.calls.append((model_spec.model, system_prompt, user_prompt))
        if not self._responses:
            raise AssertionError("No more stubbed responses available")
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class DummyOutlineService:
    async def generate_outline(self, outline_request):  # pragma: no cover - not used
        raise AssertionError("Outline generation should not be invoked in this test")


class NoopReportStore:
    def __init__(self):
        base_dir = Path(os.getcwd())
        self._handle = StoredReportHandle(
            report_id=uuid.uuid4(),
            owner_user_id=uuid.uuid4(),
            report_dir=base_dir,
            outline_path=base_dir / "noop-outline.json",
            narrative_path=base_dir / "noop-report.md",
        )

    def prepare_report(self, request, outline):
        return self._handle

    def finalize_report(self, handle, narration, written_sections, summary=None):
        return None

    def discard_report(self, handle):
        return None


class CappedOutlineService(OutlineService):
    def __init__(self, max_sections: int, text_client=None) -> None:
        super().__init__(text_client=text_client)
        self._max_sections = max_sections

    async def generate_outline(self, outline_request):
        outline = await super().generate_outline(outline_request)
        if len(outline.sections) > self._max_sections:
            outline = Outline(
                report_title=outline.report_title,
                sections=outline.sections[: self._max_sections],
            )
        return outline


def test_report_generator_stream_produces_complete_report():
    outline = Outline(
        report_title="Insights",
        sections=[Section(title="Background", subsections=["Overview"])],
    )
    stub_text_client = StubTextClient(
        [
            "### Overview\nWriter body",
            "### Overview\nTranslated body",
        ]
    )
    service = ReportGeneratorService(
        outline_service=DummyOutlineService(),
        text_client=stub_text_client,
        report_store=NoopReportStore(),
    )
    request = GenerateRequest.model_validate(
        {
            "outline": outline.model_dump(),
            "models": {
                "outline": {"model": "outline-model"},
                "writer": {"model": "writer-model"},
                "translator": {"model": "translator-model"},
            },
            "return": "report_with_outline",
        }
    )

    events = []

    async def collect_events():
        async for event in service.stream_report(request):
            events.append(event)

    asyncio.run(collect_events())

    assert [event["status"] for event in events] == [
        "started",
        "using_provided_outline",
        "persistence_ready",
        "begin_sections",
        "writing_section",
        "translating_section",
        "section_complete",
        "complete",
    ]

    final_event = events[-1]
    assert final_event["report_title"] == "Insights"
    assert final_event["report"] == "Insights\n\n1: Background\n\n1.1: Overview\nTranslated body"
    assert final_event["outline_used"] == outline.model_dump()

    call_models = [model for model, *_ in stub_text_client.calls]
    assert call_models == ["writer-model", "translator-model"]


def test_report_generator_translation_failure_emits_error_event():
    outline = Outline(
        report_title="Insights",
        sections=[Section(title="Background", subsections=["Overview"])],
    )
    stub_text_client = StubTextClient(
        [
            "### Overview\nWriter body",
            RuntimeError("translator boom"),
        ]
    )
    service = ReportGeneratorService(
        outline_service=DummyOutlineService(),
        text_client=stub_text_client,
        report_store=NoopReportStore(),
    )
    request = GenerateRequest.model_validate(
        {
            "outline": outline.model_dump(),
            "models": {
                "outline": {"model": "outline-model"},
                "writer": {"model": "writer-model"},
                "translator": {"model": "translator-model"},
            },
        }
    )

    events = []

    async def collect_events():
        async for event in service.stream_report(request):
            events.append(event)

    asyncio.run(collect_events())

    statuses = [event["status"] for event in events]
    assert statuses == [
        "started",
        "using_provided_outline",
        "persistence_ready",
        "begin_sections",
        "writing_section",
        "translating_section",
        "error",
    ]

    final_event = events[-1]
    assert "translator boom" in final_event["detail"]
    assert final_event["section"] == "1: Background"
    assert len(stub_text_client.calls) == 2


def test_report_generator_runs_translation_even_when_models_match():
    outline = Outline(
        report_title="Insights",
        sections=[Section(title="Background", subsections=["Overview"])],
    )
    stub_text_client = StubTextClient(
        [
            "### Overview\nWriter body",
            "### Overview\nTranslated body",
        ]
    )
    service = ReportGeneratorService(
        outline_service=DummyOutlineService(),
        text_client=stub_text_client,
        report_store=NoopReportStore(),
    )
    request = GenerateRequest.model_validate(
        {
            "outline": outline.model_dump(),
            "models": {
                "outline": {"model": "outline-model"},
                "writer": {"model": "writer-model"},
                "translator": {"model": "translator-model"},
            },
        }
    )

    events = []

    async def collect_events():
        async for event in service.stream_report(request):
            events.append(event)

    asyncio.run(collect_events())

    statuses = [event["status"] for event in events]
    assert "translating_section" in statuses
    assert statuses[-1] == "complete"
    assert len(stub_text_client.calls) == 2


def test_report_generator_processes_multiple_sections_with_minimal_outline():
    max_sections = 4
    sections = []
    responses = []
    expected_translated_sections = []
    for index in range(max_sections):
        section_number = index + 1
        subsection_title = f"{section_number}.1: Detail {section_number}"
        sections.append(Section(title=f"Topic {section_number}", subsections=[f"Detail {section_number}"]))
        responses.extend(
            [
                f"{subsection_title}\nWriter body {section_number}",
                f"{subsection_title}\nTranslated body {section_number}",
            ]
        )
        expected_translated_sections.append(f"Translated body {section_number}")

    outline = Outline(report_title="Limited", sections=sections)
    stub_text_client = StubTextClient(responses)
    service = ReportGeneratorService(
        outline_service=DummyOutlineService(),
        text_client=stub_text_client,
        report_store=NoopReportStore(),
    )
    request = GenerateRequest.model_validate(
        {
            "outline": outline.model_dump(),
            "models": {
                "outline": {"model": "outline-model"},
                "writer": {"model": "writer-model"},
                "translator": {"model": "translator-model"},
            },
            "return": "report_with_outline",
        }
    )

    events = []

    async def collect_events():
        async for event in service.stream_report(request):
            events.append(event)

    asyncio.run(collect_events())

    statuses = [event["status"] for event in events]
    assert statuses[0] == "started"
    assert statuses.count("section_complete") == max_sections
    assert statuses[-1] == "complete"

    final_event = events[-1]
    assert final_event["outline_used"] == outline.model_dump()
    for translated_body in expected_translated_sections:
        assert translated_body in final_event["report"]

    assert len(stub_text_client.calls) == max_sections * 2


def test_generate_report_endpoint_streams_events():
    class FakeReportGeneratorService:
        def __init__(self, events, delay_between_events=0.0):
            self._events = events
            self._delay_between_events = delay_between_events
            self.requests = []

        async def stream_report(self, generate_request):
            self.requests.append(generate_request)
            for index, event in enumerate(self._events):
                if index and self._delay_between_events:
                    await asyncio.sleep(self._delay_between_events)
                yield event

    events = [
        {"status": "started"},
        {"status": "complete", "report_title": "AI", "report": "Ready"},
    ]
    delay_between_events = 0.1
    fake_service = FakeReportGeneratorService(
        events, delay_between_events=delay_between_events
    )

    app.dependency_overrides[get_report_service] = lambda: fake_service

    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    sock = config.bind_socket()
    port = sock.getsockname()[1]
    server = uvicorn.Server(config)
    thread = threading.Thread(
        target=server.run,
        kwargs={"sockets": [sock]},
        daemon=True,
    )
    thread.start()
    try:
        while not server.started:
            time.sleep(0.01)

        with httpx.Client(base_url=f"http://127.0.0.1:{port}") as client:
            with client.stream(
                "POST",
                "/generate_report",
                json={"topic": "AI", "mode": "generate_report"},
            ) as response:
                assert response.status_code == 200
                assert response.headers["content-type"] == "application/x-ndjson"

                line_iterator = response.iter_lines()
                first_read_started = time.perf_counter()
                first_line = next(line_iterator)
                first_elapsed = time.perf_counter() - first_read_started
                assert first_elapsed < delay_between_events / 2
                assert json.loads(first_line) == events[0]

                second_read_started = time.perf_counter()
                second_line = next(line_iterator)
                second_elapsed = time.perf_counter() - second_read_started
                assert second_elapsed >= delay_between_events * 0.8
                assert json.loads(second_line) == events[1]

                assert list(line_iterator) == []
    finally:
        app.dependency_overrides.pop(get_report_service, None)
        server.should_exit = True
        thread.join()

    assert len(fake_service.requests) == 1
    request = fake_service.requests[0]
    assert isinstance(request, GenerateRequest)
    assert request.topic == "AI"
    assert request.mode == "generate_report"


@pytest.mark.skipif(
    os.getenv("RUN_OPENAI_LIVE_TESTS") != "1",
    reason="Set RUN_OPENAI_LIVE_TESTS=1 to run live OpenAI integration tests.",
)
def test_report_generator_streams_with_live_openai():
    max_sections = 4
    live_model = os.getenv("OPENAI_LIVE_TEST_MODEL", DEFAULT_TEXT_MODEL)
    request = GenerateRequest.model_validate(
        {
            "topic": "Adoption of assistive AI in education",
            "mode": "generate_report",
            "models": {
                "outline": {"model": live_model},
                "writer": {"model": live_model},
                "translator": {"model": live_model},
            },
            "return": "report_with_outline",
        }
    )

    service = ReportGeneratorService(
        outline_service=CappedOutlineService(max_sections),
        report_store=NoopReportStore(),
    )
    events = []

    async def collect_events():
        async for event in service.stream_report(request):
            events.append(event)

    asyncio.run(collect_events())

    statuses = [event["status"] for event in events]
    assert statuses[0] == "started"
    assert "generating_outline" in statuses
    assert "outline_ready" in statuses
    assert "writing_section" in statuses
    assert "section_complete" in statuses
    assert statuses[-1] == "complete"

    outline_ready_events = [
        event for event in events if event["status"] == "outline_ready"
    ]
    assert outline_ready_events, "Expected an outline_ready event from OpenAI"
    assert outline_ready_events[0]["sections"] <= max_sections

    final_event = events[-1]
    assert final_event["report"].strip()
    outline_used = final_event["outline_used"]
    assert outline_used["report_title"] == final_event["report_title"]
    assert len(outline_used["sections"]) <= max_sections
