from __future__ import annotations

from typing import Any, Dict, Optional

from .formatting import parse_outline_json
from .models import OutlineRequest, ModelSpec, ReasoningEffort, supports_reasoning
from .openai_client import call_openai_text
from .prompts import build_outline_prompt_json, build_outline_prompt_markdown


class OutlineService:
    """Encapsulates outline request helpers shared by GET/POST flows."""

    @staticmethod
    def build_outline_request(
        topic: str,
        outline_format: str,
        model_name: Optional[str],
        reasoning_effort: Optional[ReasoningEffort],
    ) -> OutlineRequest:
        model_spec = ModelSpec(model=model_name or "gpt-4o-mini")
        if reasoning_effort and supports_reasoning(model_spec.model):
            model_spec.reasoning_effort = reasoning_effort  # Filtering occurs downstream
        return OutlineRequest(topic=topic, format=outline_format, model=model_spec)

    @staticmethod
    def handle_outline_request(outline_request: OutlineRequest) -> Dict[str, Any]:
        system = "You generate structured outlines."
        prompt = (
            build_outline_prompt_json(outline_request.topic)
            if outline_request.format == "json"
            else build_outline_prompt_markdown(outline_request.topic)
        )
        text = call_openai_text(outline_request.model, system, prompt)
        if outline_request.format == "json":
            try:
                outline = parse_outline_json(text)
                return outline.model_dump()
            except Exception as exception:  # pragma: no cover - defensive
                raise OutlineParsingError(str(exception), text) from exception
        return {"markdown_outline": text}


class OutlineParsingError(Exception):
    """Raised when the LLM returns malformed JSON for the outline."""

    def __init__(self, message: str, raw_response: str):
        super().__init__(message)
        self.raw_response = raw_response
