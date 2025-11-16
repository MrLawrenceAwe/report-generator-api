from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Optional

from openai import AsyncOpenAI, OpenAI

from .models import ModelSpec, supports_reasoning


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
        response = self._sync_client.responses.create(
            **_build_request_kwargs(model_spec, system_prompt, user_prompt, style_hint)
        )
        return response.output_text

    async def call_text_async(
        self,
        model_spec: ModelSpec,
        system_prompt: str,
        user_prompt: str,
        style_hint: Optional[str] = None,
    ) -> str:
        response = await self._async_client.responses.create(
            **_build_request_kwargs(model_spec, system_prompt, user_prompt, style_hint)
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


def _build_request_kwargs(
    model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str]
) -> Dict[str, Any]:
    messages = []
    if style_hint:
        messages.append({"role": "system", "content": style_hint})
    messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    kwargs: Dict[str, Any] = {
        "model": model_spec.model,
        "input": messages,
    }
    if model_spec.reasoning_effort and supports_reasoning(model_spec.model):
        kwargs["reasoning"] = {"effort": model_spec.reasoning_effort}
    return kwargs
