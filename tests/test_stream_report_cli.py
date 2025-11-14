from pathlib import Path

import pytest

from client.stream_report import load_payload


def test_load_payload_requires_json_object(tmp_path: Path) -> None:
    payload_file = tmp_path / "payload.json"
    payload_file.write_text("[1, 2, 3]", encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        load_payload(payload_file, topic=None)

    assert "JSON object" in str(excinfo.value)
