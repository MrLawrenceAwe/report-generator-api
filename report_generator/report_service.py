from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, List, Optional

from .formatting import (
    ensure_section_numbering,
    ensure_subsection_numbering,
    enforce_subsection_headings,
)
from .models import (
    GenerateRequest,
    ModelSpec,
    Outline,
    OutlineRequest,
    maybe_add_reasoning,
)
from .openai_client import call_openai_text_async
from .outline_service import OutlineParsingError, OutlineService
from .prompts import (
    build_section_translator_prompt,
    build_section_writer_prompt,
    build_translation_cleanup_prompt,
)
from .summary import should_elevate_context


@dataclass
class NumberedSection:
    title: str
    subsections: List[str]


@dataclass
class WrittenSection:
    title: str
    body: str


@dataclass
class WriterState:
    primary: ModelSpec
    fallback: Optional[ModelSpec]
    active: ModelSpec
    using_fallback: bool = False

    @classmethod
    def build(cls, primary: ModelSpec, fallback: Optional[ModelSpec]) -> "WriterState":
        return cls(primary=primary, fallback=fallback, active=primary)

    def activate_fallback(self) -> bool:
        if self.fallback and not self.using_fallback:
            self.using_fallback = True
            self.active = self.fallback
            return True
        return False


class ReportGeneratorService:
    def __init__(self, outline_service: Optional[OutlineService] = None) -> None:
        self.outline_service = outline_service or OutlineService()

    async def stream_report(self, generate_request: GenerateRequest) -> AsyncGenerator[Dict[str, Any], None]:
        runner = _ReportStreamRunner(self, generate_request)
        async for event in runner.run():
            yield event

    @staticmethod
    def _build_numbered_sections(outline: Outline) -> List[NumberedSection]:
        numbered_sections: List[NumberedSection] = []
        for section_index, section in enumerate(outline.sections, start=1):
            section_title = ensure_section_numbering(section.title, section_index)
            subsection_titles = [
                ensure_subsection_numbering(subsection, section_index, subsection_index)
                for subsection_index, subsection in enumerate(section.subsections, start=1)
            ]
            numbered_sections.append(NumberedSection(title=section_title, subsections=subsection_titles))
        return numbered_sections

    @staticmethod
    async def _yield_control() -> None:
        await asyncio.sleep(0)

    @asynccontextmanager
    async def _emit_status(self, payload: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        yield payload
        await self._yield_control()


@dataclass
class _ReportStreamRunner:
    service: ReportGeneratorService
    request: GenerateRequest

    def __post_init__(self) -> None:
        models = self.request.models
        self.outline_spec = models.get("outline", ModelSpec(model="gpt-4o-mini"))
        self.writer_spec = models.get("writer", ModelSpec(model="gpt-4o-mini"))
        self.translator_spec = models.get("translator", ModelSpec(model="gpt-4o-mini"))
        self.cleanup_spec = models.get("cleanup", self.translator_spec)
        self.writer_state = WriterState.build(
            self.writer_spec,
            ModelSpec(model=self.request.writer_fallback) if self.request.writer_fallback else None,
        )
        self.cleanup_required = self.cleanup_spec.model != self.translator_spec.model

    async def run(self) -> AsyncGenerator[Dict[str, Any], None]:
        async with self.service._emit_status({"status": "started"}) as status:
            yield status

        provided_outline = self.request.outline
        if provided_outline is None:
            if not self.request.topic:
                async with self.service._emit_status(
                    {"status": "error", "detail": "A topic is required when no outline is provided."}
                ) as status:
                    yield status
                return

            outline_status: Dict[str, Any] = {"status": "generating_outline", "model": self.outline_spec.model}
            maybe_add_reasoning(outline_status, "reasoning_effort", self.outline_spec)
            async with self.service._emit_status(outline_status) as status:
                yield status

            outline_request = OutlineRequest(topic=self.request.topic, model=self.outline_spec)
            try:
                outline = await asyncio.to_thread(self.service.outline_service.generate_outline, outline_request)
            except OutlineParsingError as exception:  # pragma: no cover - defensive
                error_status = {
                    "status": "error",
                    "detail": f"Failed to parse outline JSON: {exception}",
                    "raw_outline": exception.raw_response,
                }
                async with self.service._emit_status(error_status) as status:
                    yield status
                return

            outline_ready_status: Dict[str, Any] = {
                "status": "outline_ready",
                "model": self.outline_spec.model,
                "sections": len(outline.sections),
            }
            maybe_add_reasoning(outline_ready_status, "reasoning_effort", self.outline_spec)
            async with self.service._emit_status(outline_ready_status) as status:
                yield status
        else:
            outline = provided_outline
            async with self.service._emit_status(
                {"status": "using_provided_outline", "sections": len(outline.sections)}
            ) as status:
                yield status

        numbered_sections = self.service._build_numbered_sections(outline)
        all_section_headers = [entry.title for entry in numbered_sections]
        assembled_narration = outline.report_title
        written_sections: List[WrittenSection] = []

        begin_status = self._build_begin_sections_status(outline)
        async with self.service._emit_status(begin_status) as status:
            yield status

        for section in numbered_sections:
            section_title = section.title
            subsection_titles = section.subsections

            async with self.service._emit_status({"status": "writing_section", "section": section_title}) as status:
                yield status

            writer_system = "You write high-quality, well-structured prose that continues a report seamlessly."
            elevate_context = should_elevate_context(section_title, subsection_titles)
            report_context = None
            if elevate_context and written_sections:
                report_context = "\n\n".join(f"{item.title}\n\n{item.body}" for item in written_sections)
            writer_prompt = build_section_writer_prompt(
                outline.report_title,
                all_section_headers,
                section_title,
                subsection_titles,
                full_report_context=report_context,
            )
            while True:
                try:
                    section_text = await call_openai_text_async(self.writer_state.active, writer_system, writer_prompt)
                    break
                except Exception as exception:
                    fallback_status = self._maybe_activate_writer_fallback(section_title, str(exception))
                    if fallback_status is None:
                        raise
                    async with self.service._emit_status(fallback_status) as status:
                        yield status
                    continue
            section_text = enforce_subsection_headings(section_text, subsection_titles)
            written_sections.append(WrittenSection(title=section_title, body=section_text.strip()))

            async with self.service._emit_status({"status": "translating_section", "section": section_title}) as status:
                yield status
            narrated = await self._translate_section(
                outline.report_title,
                section_title,
                section_text,
                inline_cleanup=not self.cleanup_required,
            )

            cleaned_narration = narrated
            if self.cleanup_required:
                async with self.service._emit_status({"status": "cleaning_section", "section": section_title}) as status:
                    yield status
                cleaned_narration = await self._cleanup_section(
                    outline.report_title,
                    section_title,
                    narrated,
                )

            cleaned_narration = enforce_subsection_headings(cleaned_narration, subsection_titles).strip()

            if assembled_narration:
                assembled_narration += "\n\n"
            assembled_narration += f"{section_title}\n\n{cleaned_narration}"

            async with self.service._emit_status({"status": "section_complete", "section": section_title}) as status:
                yield status

        final_payload = {
            "status": "complete",
            "report_title": outline.report_title,
            "report": assembled_narration,
        }
        if self.request.return_ == "report_with_outline":
            final_payload["outline_used"] = outline.model_dump()

        async with self.service._emit_status(final_payload) as status:
            yield status


    def _build_begin_sections_status(self, outline: Outline) -> Dict[str, Any]:
        begin_status: Dict[str, Any] = {
            "status": "begin_sections",
            "count": len(outline.sections),
            "writer_model": self.writer_spec.model,
            "translator_model": self.translator_spec.model,
        }
        if self.writer_state.fallback:
            begin_status["writer_fallback_model"] = self.writer_state.fallback.model
        maybe_add_reasoning(begin_status, "writer_reasoning_effort", self.writer_spec)
        maybe_add_reasoning(begin_status, "translator_reasoning_effort", self.translator_spec)
        if self.cleanup_required:
            begin_status["cleanup_model"] = self.cleanup_spec.model
            maybe_add_reasoning(begin_status, "cleanup_reasoning_effort", self.cleanup_spec)
        return begin_status

    def _maybe_activate_writer_fallback(self, section_title: str, error: str) -> Optional[Dict[str, Any]]:
        if not self.writer_state.activate_fallback():
            return None
        return {
            "status": "writer_model_fallback",
            "section": section_title,
            "previous_model": self.writer_spec.model,
            "fallback_model": self.writer_state.active.model,
            "error": error,
        }

    async def _translate_section(
        self,
        report_title: str,
        section_title: str,
        section_text: str,
        inline_cleanup: bool,
    ) -> str:
        translator_system = "You translate prose into clear, audio-friendly narration without losing information."
        translator_prompt = build_section_translator_prompt(
            report_title,
            section_title,
            section_text,
            strip_meta=inline_cleanup,
        )
        return await call_openai_text_async(self.translator_spec, translator_system, translator_prompt)

    async def _cleanup_section(self, report_title: str, section_title: str, narrated: str) -> str:
        cleanup_system = "You remove meta commentary from narrated report sections while keeping content intact."
        cleanup_prompt = build_translation_cleanup_prompt(report_title, section_title, narrated)
        return await call_openai_text_async(self.cleanup_spec, cleanup_system, cleanup_prompt)
