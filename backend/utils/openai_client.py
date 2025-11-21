from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, List, Optional, Sequence, Union

from openai import AsyncOpenAI, OpenAI

from backend.schemas import ModelSpec
from backend.utils.model_utils import supports_reasoning


class OpenAITextClient:
    """Thin wrapper around OpenAI clients used to send text requests."""

    def __init__(
        self,
        sync_client: Optional[OpenAI] = None,
        async_client: Optional[AsyncOpenAI] = None,
    ) -> None:
        self._sync_client = sync_client or self._make_sync_client()
        self._async_client = async_client or self._make_async_client()

    def call_text(
        self,
        model_spec: ModelSpec,
        system_prompt: str,
        user_prompt: str,
        style_hint: Optional[str] = None,
    ) -> str:
        try:
            response = self._sync_client.chat.completions.create(
                **_build_chat_kwargs(model_spec, system_prompt, user_prompt, style_hint)
            )
            return _extract_chat_text(response)
        except Exception:
            # Fall back to Responses API for models that are not yet on Chat,
            # or when the Chat endpoint is unavailable.
            response = self._sync_client.responses.create(
                **_build_response_kwargs(model_spec, system_prompt, user_prompt, style_hint)
            )
            return response.output_text

    async def call_text_async(
        self,
        model_spec: ModelSpec,
        system_prompt: str,
        user_prompt: str,
        style_hint: Optional[str] = None,
    ) -> str:
        try:
            response = await self._async_client.chat.completions.create(
                **_build_chat_kwargs(model_spec, system_prompt, user_prompt, style_hint)
            )
            return _extract_chat_text(response)
        except Exception:
            response = await self._async_client.responses.create(
                **_build_response_kwargs(model_spec, system_prompt, user_prompt, style_hint)
            )
            return response.output_text

    @staticmethod
    def _make_sync_client() -> OpenAI:
        base_url = os.environ.get("OPENAI_BASE_URL")
        return OpenAI(base_url=base_url) if base_url else OpenAI()

    @staticmethod
    def _make_async_client() -> AsyncOpenAI:
        base_url = os.environ.get("OPENAI_BASE_URL")
        return AsyncOpenAI(base_url=base_url) if base_url else AsyncOpenAI()


@lru_cache
def _default_text_client() -> OpenAITextClient:
    return OpenAITextClient()


def get_default_text_client() -> OpenAITextClient:
    return _default_text_client()


def _build_chat_kwargs(
    model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str]
) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "model": model_spec.model,
        "messages": _build_messages(system_prompt, user_prompt, style_hint),
    }
    if model_spec.reasoning_effort and supports_reasoning(model_spec.model):
        kwargs["reasoning"] = {"effort": model_spec.reasoning_effort}
    return kwargs


def _build_response_kwargs(
    model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str]
) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "model": model_spec.model,
        "input": _build_messages(system_prompt, user_prompt, style_hint),
    }
    if model_spec.reasoning_effort and supports_reasoning(model_spec.model):
        kwargs["reasoning"] = {"effort": model_spec.reasoning_effort}
    return kwargs


def _build_messages(system_prompt: str, user_prompt: str, style_hint: Optional[str]) -> List[Dict[str, str]]:
    messages = []
    if style_hint:
        messages.append({"role": "system", "content": style_hint})
    messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})
    return messages


def _extract_chat_text(response: Any) -> str:
    """Extract plain text from a Chat Completions response."""
    if not response or not getattr(response, "choices", None):
        return ""
    message = response.choices[0].message
    content: Union[str, Sequence[Any], None] = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, Sequence):
        parts: List[str] = []
        for part in content:
            # New SDK returns objects with a .text attribute; fall back to dict lookup.
            text = getattr(part, "text", None)
            if text is None and isinstance(part, dict):
                text = part.get("text")
            if text:
                parts.append(text)
        return "".join(parts)
    return ""
