from __future__ import annotations

import re
from json import JSONDecodeError, JSONDecoder
from typing import List

from backend.models import Outline

_SECTION_LABEL_RE = re.compile(r"Section\s+(\d+(?:\.\d+)*)\s*[:.-]?\s*(.*)", re.IGNORECASE)
_NUMBER_PREFIX_RE = re.compile(r"^(\d+(?:\.\d+)*)\s*[:.-]?\s*(.*)$")
_HASH_HEADING_PATTERN = re.compile(r"^###\s*")
_NUMBERED_HEADING_PATTERN = re.compile(r"^(?:###\s*)?\d+(?:\.\d+)*\s*[:.-]?")


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
    subsection_cursor = 0

    for line in lines:
        stripped = line.lstrip()
        if subsection_cursor < len(subsection_titles):
            if _HASH_HEADING_PATTERN.match(stripped) or _NUMBERED_HEADING_PATTERN.match(stripped):
                prefix = line[: len(line) - len(stripped)]
                result.append(f"{prefix}{subsection_titles[subsection_cursor]}")
                subsection_cursor += 1
                continue
        result.append(line)

    return "\n".join(result)


def parse_outline_json(text: str) -> Outline:
    cleaned = text.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        cleaned = cleaned.strip("`").strip()
        newline = cleaned.find("\n")
        if newline != -1:
            cleaned = cleaned[newline + 1 :].strip()

    decoder = JSONDecoder()

    def _decode(candidate: str) -> Outline:
        data, _ = decoder.raw_decode(candidate)
        return Outline(**data)

    try:
        return _decode(cleaned)
    except JSONDecodeError:
        first_brace = cleaned.find("{")
        if first_brace > 0:
            try:
                return _decode(cleaned[first_brace:])
            except JSONDecodeError:
                pass
        raise
