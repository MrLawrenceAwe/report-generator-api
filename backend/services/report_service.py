from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.utils.formatting import (
    ensure_section_numbering,
    ensure_subsection_numbering,
    enforce_subsection_headings,
)
from backend.schemas import (
    DEFAULT_TEXT_MODEL,
    GenerateRequest,
    ModelSpec,
    Outline,
    Section,
)
from backend.utils.model_utils import maybe_add_reasoning
from backend.utils.openai_client import OpenAITextClient, get_default_text_client
from .outline_service import OutlineParsingError, OutlineService
from backend.utils.prompts import (
    build_section_translator_prompt,
    build_section_writer_prompt,
)
from .report_state import NumberedSection, WrittenSection, WriterState
from backend.storage import GeneratedReportStore, StoredReportHandle
from backend.utils.summary import should_elevate_context


class ReportGeneratorService:
    def __init__(
        self,
        outline_service: Optional[OutlineService] = None,
        text_client: Optional[OpenAITextClient] = None,
        report_store: Optional[GeneratedReportStore] = None,
    ) -> None:
        self.text_client = text_client or get_default_text_client()
        self.outline_service = outline_service or OutlineService(
            text_client=self.text_client
        )
        self.report_store = report_store or GeneratedReportStore()

    async def stream_report(
        self, generate_request: GenerateRequest
    ) -> AsyncGenerator[Dict[str, Any], None]:
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
                for subsection_index, subsection in enumerate(
                    section.subsections, start=1
                )
            ]
            numbered_sections.append(
                NumberedSection(title=section_title, subsections=subsection_titles)
            )
        return numbered_sections

    @staticmethod
    async def _yield_control() -> None:
        await asyncio.sleep(0)

    @asynccontextmanager
    async def _emit_status(
        self, payload: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        yield payload
        await self._yield_control()


class _ReportStreamRunner:
    service: ReportGeneratorService
    request: GenerateRequest

    def __init__(
        self, service: ReportGeneratorService, request: GenerateRequest
    ) -> None:
        self.service = service
        self.request = request
        self.report_store = service.report_store
        self.__post_init__()

    def __post_init__(self) -> None:
        models = self.request.models
        self.outline_spec = models.get("outline", ModelSpec(model=DEFAULT_TEXT_MODEL))
        self.writer_spec = models.get("writer", ModelSpec(model=DEFAULT_TEXT_MODEL))
        self.translator_spec = models.get("translator", ModelSpec(model=DEFAULT_TEXT_MODEL))
        self.writer_state = WriterState.build(
            self.writer_spec,
            (
                ModelSpec(model=self.request.writer_fallback)
                if self.request.writer_fallback
                else None
            ),
        )
        self._encountered_error = False
        self._assembled_narration: Optional[str] = None
        self._storage_handle: Optional[StoredReportHandle] = None
        self._written_sections: List[WrittenSection] = []

    async def run(self) -> AsyncGenerator[Dict[str, Any], None]:
        try:
            async with self.service._emit_status({"status": "started"}) as status:
                yield status

            self._resolved_outline: Optional[Outline] = None
            async for status in self._outline_phase():
                yield status
            outline = self._resolved_outline
            if outline is None:
                return

            storage_status = self._prepare_storage(outline)
            if storage_status:
                async with self.service._emit_status(storage_status) as status:
                    yield status

            numbered_sections = self.service._build_numbered_sections(outline)
            all_section_headers = [entry.title for entry in numbered_sections]

            begin_status = self._build_begin_sections_status(outline)
            async with self.service._emit_status(begin_status) as status:
                yield status

            async for status in self._write_sections(
                outline, numbered_sections, all_section_headers
            ):
                yield status

            if self._encountered_error:
                self._mark_storage_failed("Report generation aborted before completion.")
                return

            assembled_narration = self._assembled_narration or ""

            finalize_error = self._finalize_report_persistence(assembled_narration)
            if finalize_error:
                async with self.service._emit_status(finalize_error) as status:
                    yield status
                return

            final_payload = self._build_final_payload(outline, assembled_narration)

            async with self.service._emit_status(final_payload) as status:
                yield status
        except asyncio.CancelledError:
            self._mark_storage_failed("Report generation cancelled")
            raise

    async def _outline_phase(self) -> AsyncGenerator[Dict[str, Any], None]:
        provided_outline = self.request.outline
        if provided_outline is None:
            outline_status: Dict[str, Any] = {
                "status": "generating_outline",
                "model": self.outline_spec.model,
            }
            maybe_add_reasoning(outline_status, "reasoning_effort", self.outline_spec)
            async with self.service._emit_status(outline_status) as status:
                yield status

            outline_request = self.service.outline_service.build_outline_request(
                self.request.topic,
                "json",
                model_spec=self.outline_spec,
                sections=self.request.sections,
                subject_inclusions=self.request.subject_inclusions,
                subject_exclusions=self.request.subject_exclusions,
            )
            try:
                outline = await self.service.outline_service.generate_outline(
                    outline_request
                )
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
                "outline": outline.model_dump(),
            }
            maybe_add_reasoning(
                outline_ready_status, "reasoning_effort", self.outline_spec
            )
            async with self.service._emit_status(outline_ready_status) as status:
                yield status
            self._resolved_outline = outline
            return

        async with self.service._emit_status(
            {
                "status": "using_provided_outline",
                "sections": len(provided_outline.sections),
                "outline": provided_outline.model_dump(),
            }
        ) as status:
            yield status
        self._resolved_outline = provided_outline
        return

    async def _write_sections(
        self,
        outline: Outline,
        numbered_sections: List[NumberedSection],
        all_section_headers: List[str],
    ) -> AsyncGenerator[Dict[str, Any], None]:
        self._written_sections = []
        assembled_blocks: List[str] = [outline.report_title]

        for section in numbered_sections:
            async for status in self._process_section(
                outline,
                section,
                all_section_headers,
                assembled_blocks,
            ):
                yield status
            if self._encountered_error:
                break

        self._assembled_narration = "\n\n".join(assembled_blocks)
        return

    async def _process_section(
        self,
        outline: Outline,
        section: NumberedSection,
        all_section_headers: List[str],
        assembled_blocks: List[str],
    ) -> AsyncGenerator[Dict[str, Any], None]:
        section_title = section.title
        subsection_titles = section.subsections

        async for status in self._emit_status_payload(
            {"status": "writing_section", "section": section_title}
        ):
            yield status

        writer_system = "You write high-quality, well-structured prose that continues a report seamlessly."
        report_context = self._build_report_context(
            self._written_sections, section_title, subsection_titles
        )
        writer_prompt = build_section_writer_prompt(
            outline.report_title,
            all_section_headers,
            section_title,
            subsection_titles,
            full_report_context=report_context,
        )

        while True:
            try:
                section_text = await self.service.text_client.call_text_async(
                    self.writer_state.active,
                    writer_system,
                    writer_prompt,
                )
                break
            except BaseException as exception:
                if isinstance(exception, asyncio.CancelledError) or not isinstance(
                    exception, Exception
                ):
                    raise
                fallback_status = self._maybe_activate_writer_fallback(
                    section_title, str(exception)
                )
                if fallback_status is None:
                    async for status in self._emit_stage_error(
                        section_title, "write", exception
                    ):
                        yield status
                    return
                async for status in self._emit_status_payload(fallback_status):
                    yield status
                continue

        section_text = enforce_subsection_headings(section_text, subsection_titles)

        async for status in self._emit_status_payload(
            {"status": "translating_section", "section": section_title}
        ):
            yield status
        try:
            narrated = await self._translate_section(
                outline.report_title,
                section_title,
                section_text,
            )
        except BaseException as exception:
            if isinstance(exception, asyncio.CancelledError) or not isinstance(
                exception, Exception
            ):
                raise
            async for status in self._emit_stage_error(
                section_title, "translate", exception
            ):
                yield status
            return

        cleaned_narration = self._finalize_section_body(
            narrated, subsection_titles
        )
        written_section = WrittenSection(
            title=section_title,
            body=cleaned_narration,
        )
        self._written_sections.append(written_section)

        assembled_blocks.append(f"{section_title}\n\n{cleaned_narration}")

        async for status in self._emit_status_payload(
            {"status": "section_complete", "section": section_title}
        ):
            yield status

    def _build_report_context(
        self,
        written_sections: List[WrittenSection],
        section_title: str,
        subsection_titles: List[str],
    ) -> Optional[str]:
        if not written_sections:
            return None
        if not should_elevate_context(section_title, subsection_titles):
            return None
        return "\n\n".join(f"{item.title}\n\n{item.body}" for item in written_sections)

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
        maybe_add_reasoning(
            begin_status, "translator_reasoning_effort", self.translator_spec
        )
        return begin_status

    def _prepare_storage(self, outline: Outline) -> Optional[Dict[str, Any]]:
        if not self.report_store:
            return None
        try:
            self._storage_handle = self.report_store.prepare_report(
                self.request, outline
            )
        except Exception as exception:
            self._storage_handle = None
            return {
                "status": "warning",
                "detail": f"Persistence disabled for this run: {exception}",
            }
        return {"status": "persistence_ready"}

    def _finalize_report_persistence(
        self, assembled_narration: str
    ) -> Optional[Dict[str, Any]]:
        if not self.report_store or not self._storage_handle:
            return None
        try:
            section_payload = [
                {"title": section.title, "body": section.body}
                for section in self._written_sections
            ]
            self.report_store.finalize_report(
                self._storage_handle, assembled_narration, section_payload
            )
        except Exception as exception:
            self._mark_storage_failed(f"Failed to persist report artifacts: {exception}")
            return {
                "status": "error",
                "detail": f"Failed to persist report artifacts: {exception}",
            }
        finally:
            self._storage_handle = None
        return None

    @staticmethod
    def _finalize_section_body(
        narration: str, subsection_titles: List[str]
    ) -> str:
        return enforce_subsection_headings(narration, subsection_titles).strip()

    def _build_final_payload(
        self, outline: Outline, assembled_narration: str
    ) -> Dict[str, Any]:
        payload = {
            "status": "complete",
            "report_title": outline.report_title,
            "report": assembled_narration,
        }
        if self.request.return_ == "report_with_outline":
            payload["outline_used"] = outline.model_dump()
        return payload

    def _mark_storage_failed(self, detail: str) -> None:
        if not self.report_store or not self._storage_handle:
            return
        try:
            self.report_store.discard_report(self._storage_handle)
        finally:
            self._storage_handle = None

    def _maybe_activate_writer_fallback(
        self, section_title: str, error: str
    ) -> Optional[Dict[str, Any]]:
        if not self.writer_state.activate_fallback():
            return None
        return {
            "status": "writer_model_fallback",
            "section": section_title,
            "previous_model": self.writer_spec.model,
            "fallback_model": self.writer_state.active.model,
            "error": error,
        }

    def _stage_error_payload(
        self, section_title: str, action: str, exception: Exception
    ) -> Dict[str, Any]:
        self._encountered_error = True
        self._assembled_narration = None
        return {
            "status": "error",
            "section": section_title,
            "detail": f"Failed to {action} section '{section_title}': {exception}",
        }

    async def _emit_status_payload(
        self, payload: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        async with self.service._emit_status(payload) as status:
            yield status

    async def _emit_stage_error(
        self, section_title: str, action: str, exception: Exception
    ) -> AsyncGenerator[Dict[str, Any], None]:
        payload = self._stage_error_payload(section_title, action, exception)
        async for status in self._emit_status_payload(payload):
            yield status

    async def _translate_section(
        self,
        report_title: str,
        section_title: str,
        section_text: str,
    ) -> str:
        translator_system = "You translate prose into clear, audio-friendly narration without losing information."
        translator_prompt = build_section_translator_prompt(
            report_title,
            section_title,
            section_text,
        )
        return await self.service.text_client.call_text_async(
            self.translator_spec,
            translator_system,
            translator_prompt,
        )
