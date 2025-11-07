from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, Optional

from openai import OpenAI

from .models import ModelSpec, supports_reasoning


def _make_client() -> OpenAI:
    base_url = os.environ.get("OPENAI_BASE_URL")
    if base_url:
        return OpenAI(base_url=base_url)
    return OpenAI()


client = _make_client()


def call_openai_text(model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str] = None) -> str:
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

    response = client.responses.create(**kwargs)
    return response.output_text


async def call_openai_text_async(
    model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str] = None
) -> str:
    return await asyncio.to_thread(call_openai_text, model_spec, system_prompt, user_prompt, style_hint)
