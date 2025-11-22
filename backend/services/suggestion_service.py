from __future__ import annotations

import json
import os
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


class SuggestionService:

    def __init__(
        self,
        text_client: Optional[OpenAITextClient] = None,
        *,
        session_factory: Optional[sessionmaker[Session]] = None,
    ) -> None:
        self.text_client = text_client or get_default_text_client()
        self.session_factory = session_factory or self._build_session_factory()

    async def generate(self, request: SuggestionsRequest) -> SuggestionsResponse:
        seeds = self._collect_seeds(request)
        if not seeds:
            return SuggestionsResponse(suggestions=[])

        max_suggestions = request.max_suggestions or 10
        prompt = self._build_prompt(seeds)
        raw_response = await self.text_client.call_text_async(
            request.model, self._system_prompt(), prompt
        )
        seen: set[str] = set()
        titles = self._parse_titles(raw_response, max_suggestions, seen)
        return SuggestionsResponse(
            suggestions=[SuggestionItem(title=title, source="guided") for title in titles]
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

    def _build_prompt(self, seeds: Sequence[str]) -> str:
        seeds_block = "\n".join(f"- {entry}" for entry in seeds[:20])
        return (
            "You suggest concise, meaningful topics related to the provided seeds. "
            "Return strictly valid JSON. Use Title Case."
            f"\n\nSeeds:\n{seeds_block}\n"
            "\nOutput JSON schema:\n"
            "{\n"
            '  "suggestions": [{"title": "Concise topic string"}]\n'
            "}\n"
            "Return suggestions as objects only (never bare strings). "
            "Keep titles under 80 characters, avoid duplicates, and skip anything too vague. "
        )

    def _parse_titles(
        self, raw_response: str, max_suggestions: int, seen: Optional[set[str]] = None
    ) -> List[str]:
        if max_suggestions <= 0:
            return []
        seen_titles: set[str] = seen if seen is not None else set()
        parsed = self._try_json_parse(raw_response)
        if not parsed:
            return []
        entries = (
            parsed.get("suggestions")
            if isinstance(parsed, dict)
            else parsed
            if isinstance(parsed, list)
            else []
        )

        deduped: List[str] = []
        for entry in entries:
            title = self._extract_title(entry)
            normalized = self._normalize_title(title) if title else ""
            key = normalized.casefold()
            if not normalized or key in seen_titles:
                continue
            seen_titles.add(key)
            deduped.append(normalized)
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
        if isinstance(entry, dict):
            title = (entry.get("title") or entry.get("topic") or "").strip()
            return title or None
        if isinstance(entry, str):
            cleaned = entry.strip()
            return cleaned or None
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
        )

    @staticmethod
    def _build_session_factory() -> Optional[sessionmaker[Session]]:
        database_url = os.environ.get(_DEFAULT_DB_ENV, _DEFAULT_DB_URL)
        try:
            engine = create_engine_from_url(database_url)
        except Exception:
            return None
        return create_session_factory(engine)
