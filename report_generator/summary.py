from __future__ import annotations

from typing import List

from .models import ModelSpec
from .openai_client import call_openai_text_async
from .prompts import build_summary_detection_prompt

_SUMMARY_CLASSIFIER_SPEC = ModelSpec(model="gpt-5-nano")
_SUMMARY_CLASSIFIER_SYSTEM = "You respond with a single word: YES if the section is a summary or conclusion, otherwise NO."


async def is_summary_or_conclusion_section(section_title: str, subsection_titles: List[str]) -> bool:
    prompt = build_summary_detection_prompt(section_title, subsection_titles)
    try:
        response = await call_openai_text_async(
            _SUMMARY_CLASSIFIER_SPEC,
            _SUMMARY_CLASSIFIER_SYSTEM,
            prompt,
        )
    except Exception:
        return False

    normalized = response.strip().lower()
    return normalized.startswith("yes") or normalized.startswith("true")

