from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.db import Report, create_engine_from_url, create_session_factory, session_scope
from backend.schemas import (
    SuggestionItem,
    SuggestionsRequest,
    SuggestionsResponse,
)
from backend.utils.openai_client import OpenAITextClient, get_default_text_client

_DEFAULT_DB_ENV = "EXPLORER_DATABASE_URL"
_DEFAULT_DB_URL = "sqlite:///reportgen.db"


@dataclass(frozen=True)
class _SuggestionCandidate:
    title: str
    source: str


class SuggestionService:

    def __init__(
        self,
        text_client: Optional[OpenAITextClient] = None,
        *,
        session_factory: Optional[sessionmaker[Session]] = None,
        enable_free_roam_default: bool = False,
    ) -> None:
        self.text_client = text_client or get_default_text_client()
        self.session_factory = session_factory or self._build_session_factory()
        self.enable_free_roam_default = enable_free_roam_default

    async def generate(self, request: SuggestionsRequest) -> SuggestionsResponse:
        seeds = self._collect_seeds(request)
        if not seeds:
            return SuggestionsResponse(suggestions=[])

        enable_free_roam = request.enable_free_roam or self.enable_free_roam_default
        guided_prompt = self._build_prompt(seeds, guided=True)
        guided_task = self.text_client.call_text_async(
            request.model, self._system_prompt(), guided_prompt
        )

        free_roam_task = None
        if enable_free_roam:
            free_roam_prompt = self._build_prompt(seeds, guided=False)
            free_roam_task = self.text_client.call_text_async(
                request.model, self._system_prompt(), free_roam_prompt
            )

        guided_response = await guided_task
        guided_candidates = self._parse_candidates(guided_response, "guided")

        free_roam_candidates: List[_SuggestionCandidate] = []
        if free_roam_task:
            try:
                free_roam_response = await free_roam_task
                free_roam_candidates = self._parse_candidates(
                    free_roam_response, "free_roam"
                )
            except Exception:
                free_roam_candidates = []

        merged = self._merge_candidates(
            guided_candidates + free_roam_candidates,
            request.max_suggestions,
        )
        return SuggestionsResponse(
            suggestions=[
                SuggestionItem(title=candidate.title, source=candidate.source)
                for candidate in merged
            ]
        )

    def _collect_seeds(self, request: SuggestionsRequest) -> List[str]:
        seeds: List[str] = []
        if request.topic:
            seeds.append(request.topic)
        seeds.extend(request.seeds)
        if request.include_report_headings:
            seeds.extend(self._load_report_headings(limit=30))
        return self._normalize_titles(seeds)

    def _load_report_headings(self, *, limit: int) -> List[str]:
        if self.session_factory is None:
            return []
        try:
            with session_scope(self.session_factory) as session:
                reports = session.scalars(
                    select(Report)
                    .where(Report.sections != None)  # noqa: E711
                    .order_by(Report.created_at.desc())
                    .limit(limit)
                ).all()
        except Exception:
            return []
        headings: List[str] = []
        for report in reports:
            sections_payload = (report.sections or {}).get("outline") or {}
            sections = sections_payload.get("sections", [])
            for section in sections:
                title = (section.get("title") or "").strip()
                if title:
                    headings.append(title)
                for sub in section.get("subsections") or []:
                    cleaned_sub = (sub or "").strip()
                    if cleaned_sub:
                        headings.append(cleaned_sub)
        return headings

    def _build_prompt(self, seeds: Sequence[str], *, guided: bool) -> str:
        seeds_block = "\n".join(f"- {entry}" for entry in seeds[:20])
        guidance = (
            "Keep suggestions tightly related to the seeds; avoid vague tangents."
            if guided
            else "You can stray a bit if it helps surface adjacent or contrasting topics."
        )
        return (
            "You suggest concise, meaningful topics related to the provided seeds. "
            "Return strictly valid JSON. Use natural capitalization (handle possessives like “aviation's” without introducing stray uppercase letters)."
            f"\n\nSeeds:\n{seeds_block}\n"
            "\nOutput JSON schema:\n"
            "{\n"
            '  "suggestions": [{"title": "Concise topic"}]\n'
            "}\n"
            "Return suggestions as objects (not bare strings). "
            "Keep titles under 80 characters, avoid duplicates, and skip anything too vague. "
            f"{guidance}"
        )

    def _parse_candidates(
        self, raw_response: str, source: str
    ) -> List[_SuggestionCandidate]:
        parsed = self._try_json_parse(raw_response)
        if not parsed:
            return []
        items: List[_SuggestionCandidate] = []
        if isinstance(parsed, dict) and isinstance(parsed.get("suggestions"), list):
            entries = parsed["suggestions"]
        elif isinstance(parsed, list):
            entries = parsed
        else:
            return []
        for entry in entries:
            title = self._extract_title(entry)
            if not title:
                continue
            items.append(_SuggestionCandidate(title=title, source=source))
        return items

    def _merge_candidates(
        self,
        candidates: Sequence[_SuggestionCandidate],
        max_suggestions: int,
    ) -> List[_SuggestionCandidate]:
        deduped: List[_SuggestionCandidate] = []
        seen = set()
        for candidate in candidates:
            normalized = self._normalize_title(candidate.title)
            key = normalized.casefold()
            if not normalized or key in seen:
                continue
            seen.add(key)
            deduped.append(
                _SuggestionCandidate(
                    title=normalized,
                    source=candidate.source,
                )
            )
            if len(deduped) >= max_suggestions:
                break
        return deduped

    @staticmethod
    def _normalize_titles(values: Iterable[str]) -> List[str]:
        seen = set()
        normalized: List[str] = []
        for value in values:
            cleaned = SuggestionService._normalize_title(value)
            key = cleaned.casefold()
            if not cleaned or key in seen:
                continue
            seen.add(key)
            normalized.append(cleaned)
        return normalized

    @staticmethod
    def _normalize_title(value: str) -> str:
        if not isinstance(value, str):
            return ""
        stripped = " ".join(value.split())
        return stripped

    @staticmethod
    def _extract_title(entry: object) -> Optional[str]:
        if isinstance(entry, str):
            return entry
        if isinstance(entry, dict):
            title = (entry.get("title") or entry.get("topic") or "").strip()
            return title or None
        return None

    @staticmethod
    def _try_json_parse(payload: str) -> object:
        try:
            return json.loads(payload)
        except Exception:
            return None

    @staticmethod
    def _system_prompt() -> str:
        return (
            "You are a topic suggestion engine. Always return concise, concrete topics "
            "related to the provided seeds. Focus on usefulness over cleverness. "
            "Preserve natural capitalization; avoid auto-title-casing that breaks apostrophes or acronyms."
        )

    @staticmethod
    def _build_session_factory() -> Optional[sessionmaker[Session]]:
        database_url = os.environ.get(_DEFAULT_DB_ENV, _DEFAULT_DB_URL)
        try:
            engine = create_engine_from_url(database_url)
        except Exception:
            return None
        return create_session_factory(engine)
