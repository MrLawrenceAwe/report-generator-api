import importlib.util
import sys
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def set_openai_api_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")


def _get_prompts_module():
    module_path = Path(__file__).resolve().parents[1] / "report_generator" / "prompts.py"
    spec = importlib.util.spec_from_file_location("report_generator.prompts", module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, module)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_build_outline_prompt_json_matches_expected():
    prompts = _get_prompts_module()
    topic = "AI in healthcare"
    expected = (
        "Write a detailed outline for a report on the topic of \"AI in healthcare\".\n"
        "Organize it into main sections (Section 1, Section 2, etc.). Under each main section, list subsections (1.1, 1.2, etc.).\n"
        "Make sure it's comprehensive, covering key concepts and sub-topics.\n\n"
        "Return valid JSON only with this schema:\n"
        "{\n"
        "  \"report_title\": string,\n"
        "  \"sections\": [\n"
        "    {\n"
        "      \"title\": string,\n"
        "      \"subsections\": string[]\n"
        "    }\n"
        "  ]\n"
        "}\n"
    )

    assert prompts.build_outline_prompt_json(topic) == expected


def test_build_outline_prompt_markdown_matches_expected():
    prompts = _get_prompts_module()
    topic = "Climate change"
    expected = (
        "Write a detailed outline for a report on the topic of \"Climate change\".\n"
        "Organize it into main sections (Section 1, Section 2, etc.). Under each main section, list subsections (1.1, 1.2, etc.).\n"
        "Make sure it's comprehensive, covering key concepts and sub-topics.\n\n"
        "Return Markdown only.\n"
    )

    assert prompts.build_outline_prompt_markdown(topic) == expected
