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
    candidates = [section_title, *subsection_titles]
    return any(
        normalized
        and any(keyword in normalized for keyword in _SUMMARY_KEYWORDS)
        for normalized in (candidate.strip().lower() for candidate in candidates)
    )
