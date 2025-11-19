from typing import Any, Dict, Optional

from backend.models import ModelSpec

_REASONING_MODEL_PREFIXES = ("gpt-5", "o3", "o4")


def supports_reasoning(model_name: Optional[str]) -> bool:
    if not model_name:
        return False
    return any(model_name.startswith(prefix) for prefix in _REASONING_MODEL_PREFIXES)


def maybe_add_reasoning(payload: Dict[str, Any], key: str, model_spec: ModelSpec) -> None:
    if model_spec.reasoning_effort and supports_reasoning(model_spec.model):
        payload[key] = model_spec.reasoning_effort
