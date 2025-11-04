from __future__ import annotations

import re
from typing import List

from .models import Outline

_SECTION_LABEL_RE = re.compile(r"Section\s+(\d+(?:\.\d+)*)\s*[:.-]?\s*(.*)", re.IGNORECASE)
_NUMBER_PREFIX_RE = re.compile(r"^(\d+(?:\.\d+)*)\s*[:.-]?\s*(.*)$")


def _ensure_numbered_title(title: str, default_number: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        return f"{default_number}:"

    match = _SECTION_LABEL_RE.match(cleaned)
    if match:
        number, rest = match.groups()
        rest = rest.strip()
        return f"{number}: {rest}" if rest else f"{number}:"

    match = _NUMBER_PREFIX_RE.match(cleaned)
    if match:
        number, rest = match.groups()
        rest = rest.strip()
        if rest:
            return f"{number}: {rest}"
        return f"{number}:"

    return f"{default_number}: {cleaned}"


def ensure_section_numbering(title: str, section_index: int) -> str:
    return _ensure_numbered_title(title, str(section_index))


def ensure_subsection_numbering(title: str, section_index: int, subsection_index: int) -> str:
    return _ensure_numbered_title(title, f"{section_index}.{subsection_index}")


def enforce_subsection_headings(section_text: str, subsection_titles: List[str]) -> str:
    lines = section_text.splitlines()
    result = []
    idx = 0
    hash_heading_pattern = re.compile(r"^###\s*")
    numbered_heading_pattern = re.compile(r"^(?:###\s*)?\d+(?:\.\d+)*\s*[:.-]?")

    for line in lines:
        stripped = line.lstrip()
        if idx < len(subsection_titles):
            if hash_heading_pattern.match(stripped) or numbered_heading_pattern.match(stripped):
                prefix = line[: len(line) - len(stripped)]
                result.append(f"{prefix}{subsection_titles[idx]}")
                idx += 1
                continue
        result.append(line)

    return "\n".join(result)


def parse_outline_json(text: str) -> Outline:
    from json import loads

    cleaned = text.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        cleaned = cleaned.strip("`").strip()
        newline = cleaned.find("\n")
        if newline != -1:
            cleaned = cleaned[newline + 1 :].strip()

    data = loads(cleaned)
    return Outline(**data)

