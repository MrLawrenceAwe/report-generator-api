from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENAI_API_KEY", "test-key")
sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.formatting import parse_outline_json
from backend.models import Outline


def test_parse_outline_json_allows_trailing_text() -> None:
    text = """
    {"report_title": "Topic", "sections": []}

    Thanks for reading!
    """

    outline = parse_outline_json(text)

    assert isinstance(outline, Outline)
    assert outline.report_title == "Topic"
    assert outline.sections == []


def test_parse_outline_json_allows_prefixed_codeblock_noise() -> None:
    text = """Sure, here is what you asked for.
    ```json
    {"report_title": "Topic", "sections": []}
    ```
    Hope that helps!
    """

    outline = parse_outline_json(text)

    assert isinstance(outline, Outline)
    assert outline.report_title == "Topic"
    assert outline.sections == []
