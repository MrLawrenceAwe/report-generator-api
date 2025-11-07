from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, List

from .formatting import (
    ensure_section_numbering,
    ensure_subsection_numbering,
    enforce_subsection_headings,
    parse_outline_json,
)
from .models import (
    GenerateRequest,
    ModelSpec,
    Outline,
    maybe_add_reasoning,
)
from .openai_client import call_openai_text_async
from .prompts import (
    build_outline_prompt_json,
    build_section_translator_prompt,
    build_section_writer_prompt,
    build_translation_cleanup_prompt,
)
from .summary import is_summary_or_conclusion_section


@dataclass
class NumberedSection:
    title: str
    subsections: List[str]


@dataclass
class WrittenSection:
    title: str
    body: str


class ReportGeneratorService:
    async def stream_report(self, generate_request: GenerateRequest) -> AsyncGenerator[Dict[str, Any], None]:
        provided_outline = generate_request.outline

        async with self._emit_status({"status": "started"}) as status:
            yield status

        outline_spec = generate_request.models.get("outline", ModelSpec(model="gpt-4o-mini"))
        if provided_outline is None:
            system = "You generate structured outlines."
            prompt = build_outline_prompt_json(generate_request.topic)
            outline_status: Dict[str, Any] = {"status": "generating_outline", "model": outline_spec.model}
            maybe_add_reasoning(outline_status, "reasoning_effort", outline_spec)
            async with self._emit_status(outline_status) as status:
                yield status

            text = await call_openai_text_async(outline_spec, system, prompt)
            try:
                outline = parse_outline_json(text)
            except Exception as exception:  # pragma: no cover - defensive
                error_status = {
                    "status": "error",
                    "detail": f"Failed to parse outline JSON: {exception}",
                    "raw_outline": text,
                }
                async with self._emit_status(error_status) as status:
                    yield status
                return

            outline_ready_status: Dict[str, Any] = {
                "status": "outline_ready",
                "model": outline_spec.model,
                "sections": len(outline.sections),
            }
            maybe_add_reasoning(outline_ready_status, "reasoning_effort", outline_spec)
            async with self._emit_status(outline_ready_status) as status:
                yield status
        else:
            outline = provided_outline
            async with self._emit_status(
                {"status": "using_provided_outline", "sections": len(outline.sections)}
            ) as status:
                yield status

        numbered_sections = self._build_numbered_sections(outline)
        all_section_headers = [entry.title for entry in numbered_sections]

        writer_spec = generate_request.models.get("writer", ModelSpec(model="gpt-4o-mini"))
        translator_spec = generate_request.models.get("translator", ModelSpec(model="gpt-4o-mini"))
        cleanup_spec = generate_request.models.get("cleanup", translator_spec)

        writer_fallback_spec = (
            ModelSpec(model=generate_request.writer_fallback) if generate_request.writer_fallback else None
        )
        writer_active_spec = writer_spec
        writer_using_fallback = False

        assembled_narration = outline.report_title

        begin_sections_status: Dict[str, Any] = {
            "status": "begin_sections",
            "count": len(outline.sections),
            "writer_model": writer_spec.model,
            "translator_model": translator_spec.model,
            "cleanup_model": cleanup_spec.model,
        }
        if writer_fallback_spec:
            begin_sections_status["writer_fallback_model"] = writer_fallback_spec.model
        maybe_add_reasoning(begin_sections_status, "writer_reasoning_effort", writer_spec)
        maybe_add_reasoning(begin_sections_status, "translator_reasoning_effort", translator_spec)
        if cleanup_spec is not translator_spec:
            maybe_add_reasoning(begin_sections_status, "cleanup_reasoning_effort", cleanup_spec)
        async with self._emit_status(begin_sections_status) as status:
            yield status

        written_sections: List[WrittenSection] = []

        for entry in numbered_sections:
            section_title = entry.title
            subsection_titles = entry.subsections

            async with self._emit_status({"status": "writing_section", "section": section_title}) as status:
                yield status

            writer_system = "You write high-quality, well-structured prose that continues a report seamlessly."
            elevate_context = await is_summary_or_conclusion_section(section_title, subsection_titles)
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
                    section_text = await call_openai_text_async(writer_active_spec, writer_system, writer_prompt)
                    break
                except Exception as exception:
                    if writer_fallback_spec and not writer_using_fallback:
                        writer_using_fallback = True
                        writer_active_spec = writer_fallback_spec
                        fallback_status = {
                            "status": "writer_model_fallback",
                            "section": section_title,
                            "previous_model": writer_spec.model,
                            "fallback_model": writer_active_spec.model,
                            "error": str(exception),
                        }
                        async with self._emit_status(fallback_status) as status:
                            yield status
                        continue
                    raise
            section_text = enforce_subsection_headings(section_text, subsection_titles)
            written_sections.append(WrittenSection(title=section_title, body=section_text.strip()))

            async with self._emit_status({"status": "translating_section", "section": section_title}) as status:
                yield status
            translator_system = "You translate prose into clear, audio-friendly narration without losing information."
            translator_prompt = build_section_translator_prompt(outline.report_title, section_title, section_text)
            narrated = await call_openai_text_async(translator_spec, translator_system, translator_prompt)

            async with self._emit_status({"status": "cleaning_section", "section": section_title}) as status:
                yield status
            cleanup_system = "You remove meta commentary from narrated report sections while keeping content intact."
            cleanup_prompt = build_translation_cleanup_prompt(outline.report_title, section_title, narrated)
            cleaned_narration = await call_openai_text_async(cleanup_spec, cleanup_system, cleanup_prompt)
            cleaned_narration = enforce_subsection_headings(cleaned_narration, subsection_titles)

            if assembled_narration:
                assembled_narration += "\n\n"
            assembled_narration += f"{section_title}\n\n{cleaned_narration.strip()}"

            async with self._emit_status({"status": "section_complete", "section": section_title}) as status:
                yield status

        final_payload: Dict[str, Any] = {
            "status": "complete",
            "report_title": outline.report_title,
            "report": assembled_narration,
        }
        if generate_request.return_ == "report_with_outline":
            final_payload["outline_used"] = outline.model_dump()

        async with self._emit_status(final_payload) as status:
            yield status

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
