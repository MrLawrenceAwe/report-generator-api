import json
from pathlib import Path

import pytest

from clients.cli.stream_report import (
    _prepare_final_report,
    load_outline_request_payload,
    load_payload,
)


def test_load_payload_requires_json_object(tmp_path: Path) -> None:
    payload_file = tmp_path / "payload.json"
    payload_file.write_text("[1, 2, 3]", encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        load_payload(payload_file, topic=None)

    assert "JSON object" in str(excinfo.value)


def test_load_payload_reports_invalid_json(tmp_path: Path) -> None:
    payload_file = tmp_path / "payload.json"
    payload_file.write_text("{not valid", encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        load_payload(payload_file, topic=None)

    assert "valid JSON" in str(excinfo.value)


def test_prepare_final_report_surfaces_error_details() -> None:
    event = {
        "status": "error",
        "detail": "translator boom",
        "section": "1: Intro",
    }

    with pytest.raises(SystemExit) as excinfo:
        _prepare_final_report(event)

    message = str(excinfo.value)
    assert "translator boom" in message
    assert "1: Intro" in message


def test_prepare_final_report_requires_report_field() -> None:
    event = {"status": "complete"}

    with pytest.raises(SystemExit) as excinfo:
        _prepare_final_report(event)

    assert "'report'" in str(excinfo.value)


def test_load_outline_request_payload_uses_payload_file(tmp_path: Path) -> None:
    payload_file = tmp_path / "outline.json"
    payload_file.write_text(
        json.dumps({"topic": "Solar Storage", "format": "json"}), encoding="utf-8"
    )

    params = load_outline_request_payload(
        payload_file,
        topic=None,
        outline_format="markdown",
        sections=None,
        subject_inclusions=[],
        subject_exclusions=[],
    )

    assert params["topic"] == "Solar Storage"
    # Format preference comes from the file when provided.
    assert params["format"] == "json"


def test_load_outline_request_payload_overrides_with_cli_args(tmp_path: Path) -> None:
    payload_file = tmp_path / "outline.json"
    payload_file.write_text(json.dumps({"topic": "AI"}), encoding="utf-8")

    params = load_outline_request_payload(
        payload_file,
        topic=None,
        outline_format="markdown",
        sections=4,
        subject_inclusions=["robotics"],
        subject_exclusions=[],
    )

    assert params["sections"] == 4
    assert params["subject_inclusions"] == ["robotics"]
    assert params["format"] == "markdown"


def test_load_outline_request_payload_requires_topic(tmp_path: Path) -> None:
    payload_file = tmp_path / "outline.json"
    payload_file.write_text("{}", encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        load_outline_request_payload(
            payload_file,
            topic=None,
            outline_format="markdown",
            sections=None,
            subject_inclusions=[],
            subject_exclusions=[],
        )

    assert "topic" in str(excinfo.value)


def test_load_outline_request_payload_accepts_cli_topic(tmp_path: Path) -> None:
    payload_file = tmp_path / "outline.json"
    payload_file.write_text("{}", encoding="utf-8")

    params = load_outline_request_payload(
        payload_file,
        topic="Fallback Topic",
        outline_format="markdown",
        sections=None,
        subject_inclusions=[],
        subject_exclusions=[],
    )

    assert params["topic"] == "Fallback Topic"
