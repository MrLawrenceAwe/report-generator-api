from pathlib import Path

import pytest

from clients.cli.stream_report import _prepare_final_report, load_payload


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
