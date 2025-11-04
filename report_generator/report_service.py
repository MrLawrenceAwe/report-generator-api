from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator, Dict, List, Optional

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
    OutlineRequest,
    ReasoningEffort,
    maybe_add_reasoning,
    supports_reasoning,
)
from .openai_client import call_openai_text, call_openai_text_async
from .prompts import (
    build_outline_prompt_json,
    build_outline_prompt_markdown,
    build_section_translator_prompt,
    build_section_writer_prompt,
    build_translation_cleanup_prompt,
)
from .summary import is_summary_or_conclusion_section


class OutlineService:
    """Encapsulates outline request helpers shared by GET/POST flows."""

    @staticmethod
    def build_outline_request(
        topic: str,
        fmt: str,
        model_name: Optional[str],
        reasoning_effort: Optional[ReasoningEffort],
    ) -> OutlineRequest:
        model_spec = ModelSpec(model=model_name or "gpt-4o-mini")
        if reasoning_effort and supports_reasoning(model_spec.model):
            model_spec.reasoning_effort = reasoning_effort  # Filtering occurs downstream
        return OutlineRequest(topic=topic, format=fmt, model=model_spec)

    @staticmethod
    def handle_outline_request(req: OutlineRequest) -> Dict[str, Any]:
        system = "You generate structured outlines."
        prompt = (
            build_outline_prompt_json(req.topic)
            if req.format == "json"
            else build_outline_prompt_markdown(req.topic)
        )
        text = call_openai_text(req.model, system, prompt)
        if req.format == "json":
            try:
                outline = parse_outline_json(text)
                return outline.model_dump()
            except Exception as exc:  # pragma: no cover - defensive
                raise OutlineParsingError(str(exc), text) from exc
        return {"markdown_outline": text}


class OutlineParsingError(Exception):
    """Raised when the LLM returns malformed JSON for the outline."""

    def __init__(self, message: str, raw_response: str):
        super().__init__(message)
        self.raw_response = raw_response


class ReportGenerationService:
    async def stream_report(self, req: GenerateRequest) -> AsyncGenerator[Dict[str, Any], None]:
        provided_outline = req.outline

        yield {"status": "started"}
        await self._yield_control()

        outline_spec = req.models.get("outline", ModelSpec(model="gpt-4o-mini"))
        if provided_outline is None:
            system = "You generate structured outlines."
            prompt = build_outline_prompt_json(req.topic)
            outline_status: Dict[str, Any] = {"status": "generating_outline", "model": outline_spec.model}
            maybe_add_reasoning(outline_status, "reasoning_effort", outline_spec)
            yield outline_status
            await self._yield_control()

            text = await call_openai_text_async(outline_spec, system, prompt)
            try:
                outline = parse_outline_json(text)
            except Exception as exc:  # pragma: no cover - defensive
                yield {
                    "status": "error",
                    "detail": f"Failed to parse outline JSON: {exc}",
                    "raw_outline": text,
                }
                await self._yield_control()
                return

            outline_ready_status: Dict[str, Any] = {
                "status": "outline_ready",
                "model": outline_spec.model,
                "sections": len(outline.sections),
            }
            maybe_add_reasoning(outline_ready_status, "reasoning_effort", outline_spec)
            yield outline_ready_status
            await self._yield_control()
        else:
            outline = provided_outline
            yield {"status": "using_provided_outline", "sections": len(outline.sections)}
            await self._yield_control()

        numbered_sections = self._build_numbered_sections(outline)
        all_section_headers = [entry["section_title"] for entry in numbered_sections]

        writer_spec = req.models.get("writer", ModelSpec(model="gpt-4o-mini"))
        translator_spec = req.models.get("translator", ModelSpec(model="gpt-4o-mini"))
        cleanup_spec = req.models.get("cleanup", translator_spec)

        if req.writer_fallback:
            writer_spec.model = req.writer_fallback
            writer_spec.reasoning_effort = None

        assembled_narration = outline.report_title

        begin_sections_status: Dict[str, Any] = {
            "status": "begin_sections",
            "count": len(outline.sections),
            "writer_model": writer_spec.model,
            "translator_model": translator_spec.model,
            "cleanup_model": cleanup_spec.model,
        }
        maybe_add_reasoning(begin_sections_status, "writer_reasoning_effort", writer_spec)
        maybe_add_reasoning(begin_sections_status, "translator_reasoning_effort", translator_spec)
        if cleanup_spec is not translator_spec:
            maybe_add_reasoning(begin_sections_status, "cleanup_reasoning_effort", cleanup_spec)
        yield begin_sections_status
        await self._yield_control()

        written_sections: List[Dict[str, str]] = []

        for entry in numbered_sections:
            section_title = entry["section_title"]
            subsection_titles = entry["subsections"]

            yield {"status": "writing_section", "section": section_title}
            await self._yield_control()

            writer_system = "You write high-quality, well-structured prose that continues a report seamlessly."
            elevate_context = await is_summary_or_conclusion_section(section_title, subsection_titles)
            report_context = None
            if elevate_context and written_sections:
                report_context = "\n\n".join(f"{item['title']}\n\n{item['body']}" for item in written_sections)
            writer_prompt = build_section_writer_prompt(
                outline.report_title,
                all_section_headers,
                section_title,
                subsection_titles,
                full_report_context=report_context,
            )
            section_text = await call_openai_text_async(writer_spec, writer_system, writer_prompt)
            section_text = enforce_subsection_headings(section_text, subsection_titles)
            written_sections.append({"title": section_title, "body": section_text.strip()})

            yield {"status": "translating_section", "section": section_title}
            await self._yield_control()
            translator_system = "You translate prose into clear, audio-friendly narration without losing information."
            translator_prompt = build_section_translator_prompt(outline.report_title, section_title, section_text)
            narrated = await call_openai_text_async(translator_spec, translator_system, translator_prompt)

            yield {"status": "cleaning_section", "section": section_title}
            await self._yield_control()
            cleanup_system = "You remove meta commentary from narrated report sections while keeping content intact."
            cleanup_prompt = build_translation_cleanup_prompt(outline.report_title, section_title, narrated)
            cleaned_narration = await call_openai_text_async(cleanup_spec, cleanup_system, cleanup_prompt)
            cleaned_narration = enforce_subsection_headings(cleaned_narration, subsection_titles)

            if assembled_narration:
                assembled_narration += "\n\n"
            assembled_narration += f"{section_title}\n\n{cleaned_narration.strip()}"

            yield {"status": "section_complete", "section": section_title}
            await self._yield_control()

        final_payload: Dict[str, Any] = {
            "status": "complete",
            "report_title": outline.report_title,
            "report": assembled_narration,
        }
        if req.return_ == "report_with_outline":
            final_payload["outline_used"] = outline.model_dump()

        yield final_payload
        await self._yield_control()

    @staticmethod
    def _build_numbered_sections(outline: Outline) -> List[Dict[str, Any]]:
        numbered_sections: List[Dict[str, Any]] = []
        for idx, sec in enumerate(outline.sections, start=1):
            section_title = ensure_section_numbering(sec.title, idx)
            subsection_titles = [
                ensure_subsection_numbering(sub, idx, sub_idx) for sub_idx, sub in enumerate(sec.subsections, start=1)
            ]
            numbered_sections.append({"section_title": section_title, "subsections": subsection_titles})
        return numbered_sections

    @staticmethod
    async def _yield_control() -> None:
        await asyncio.sleep(0)
