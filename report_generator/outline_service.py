from __future__ import annotations

from typing import Any, Dict, Optional

from .formatting import parse_outline_json
from .models import (
    DEFAULT_TEXT_MODEL,
    ModelSpec,
    Outline,
    OutlineRequest,
    ReasoningEffort,
    supports_reasoning,
)
from .openai_client import OpenAITextClient, get_default_text_client
from .prompts import build_outline_prompt_json, build_outline_prompt_markdown


class OutlineService:
    """Encapsulates outline request helpers shared by GET/POST flows."""

    def __init__(self, text_client: Optional[OpenAITextClient] = None) -> None:
        self._text_client = text_client or get_default_text_client()

    @staticmethod
    def build_outline_request(
        topic: str,
        outline_format: str,
        model_name: Optional[str],
        reasoning_effort: Optional[ReasoningEffort],
    ) -> OutlineRequest:
        model_spec = ModelSpec(model=model_name or DEFAULT_TEXT_MODEL)
        if reasoning_effort and supports_reasoning(model_spec.model):
            model_spec.reasoning_effort = reasoning_effort  # Filtering occurs downstream
        return OutlineRequest(topic=topic, format=outline_format, model=model_spec)

    async def handle_outline_request(self, outline_request: OutlineRequest) -> Dict[str, Any]:
        text = await self._request_outline_text(outline_request)
        if outline_request.format == "json":
            outline = self._parse_outline(text)
            return outline.model_dump()
        return {"markdown_outline": text}

    async def generate_outline(self, outline_request: OutlineRequest) -> Outline:
        if outline_request.format != "json":
            raise ValueError("Only JSON outlines can be converted into structured models.")
        text = await self._request_outline_text(outline_request)
        return self._parse_outline(text)

    async def _request_outline_text(self, outline_request: OutlineRequest) -> str:
        system = "You generate structured outlines."
        prompt = (
            build_outline_prompt_json(outline_request.topic)
            if outline_request.format == "json"
            else build_outline_prompt_markdown(outline_request.topic)
        )
        return await self._text_client.call_text_async(outline_request.model, system, prompt)

    @staticmethod
    def _parse_outline(text: str) -> Outline:
        try:
            return parse_outline_json(text)
        except Exception as exception:  # pragma: no cover - defensive
            raise OutlineParsingError(str(exception), text) from exception


class OutlineParsingError(Exception):
    """Raised when the LLM returns malformed JSON for the outline."""

    def __init__(self, message: str, raw_response: str):
        super().__init__(message)
        self.raw_response = raw_response
