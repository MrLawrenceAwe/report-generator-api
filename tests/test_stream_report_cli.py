import json
from pathlib import Path

import pytest

from cli.stream_report import _prepare_final_report, load_payload


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
        "detail": "editor boom",
        "section": "1: Intro",
    }

    with pytest.raises(SystemExit) as excinfo:
        _prepare_final_report(event)

    message = str(excinfo.value)
    assert "editor boom" in message
    assert "1: Intro" in message


def test_prepare_final_report_requires_report_field() -> None:
    event = {"status": "complete"}

    with pytest.raises(SystemExit) as excinfo:
        _prepare_final_report(event)

    assert "'report'" in str(excinfo.value)


def test_load_payload_requires_username_with_user_email() -> None:
    with pytest.raises(SystemExit) as excinfo:
        load_payload(
            payload_file=None,
            topic="AI",
            user_email="user@example.com",
            username=None,
        )

    assert "username" in str(excinfo.value)


def test_load_payload_allows_override_when_payload_supplies_username(tmp_path: Path) -> None:
    payload_file = tmp_path / "payload.json"
    payload_file.write_text(
        json.dumps(
            {
                "topic": "AI",
                "mode": "generate_report",
                "username": "Payload User",
            }
        ),
        encoding="utf-8",
    )

    payload = load_payload(
        payload_file=payload_file,
        topic=None,
        user_email="override@example.com",
        username=None,
    )

    assert payload["user_email"] == "override@example.com"
    assert payload["username"] == "Payload User"
