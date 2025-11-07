from __future__ import annotations

from typing import List

_SUMMARY_KEYWORDS = (
    "summary",
    "conclusion",
    "conclusions",
    "final thoughts",
    "final remarks",
    "takeaways",
    "overview",
    "executive summary",
)
def should_elevate_context(section_title: str, subsection_titles: List[str]) -> bool:
    return _looks_like_summary_or_conclusion(section_title, subsection_titles)


def _looks_like_summary_or_conclusion(section_title: str, subsection_titles: List[str]) -> bool:
    candidates = [section_title, *subsection_titles]
    return any(_contains_summary_keyword(candidate) for candidate in candidates)


def _contains_summary_keyword(text: str) -> bool:
    normalized = text.strip().lower()
    if not normalized:
        return False
    return any(keyword in normalized for keyword in _SUMMARY_KEYWORDS)
