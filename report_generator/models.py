from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

ReasoningEffort = Literal["minimal", "low", "medium", "high"]

_REASONING_MODEL_PREFIXES = ("gpt-5", "o3", "o4")

DEFAULT_TEXT_MODEL = "gpt-4o-mini"


class ModelSpec(BaseModel):
    model: str = Field(default=DEFAULT_TEXT_MODEL, description="Model name, e.g., gpt-4o-mini, gpt-4o")
    reasoning_effort: Optional[ReasoningEffort] = Field(default=None, description="Reasoning effort for reasoning models")


def supports_reasoning(model_name: Optional[str]) -> bool:
    if not model_name:
        return False
    return any(model_name.startswith(prefix) for prefix in _REASONING_MODEL_PREFIXES)


def maybe_add_reasoning(payload: Dict[str, Any], key: str, model_spec: ModelSpec) -> None:
    if model_spec.reasoning_effort and supports_reasoning(model_spec.model):
        payload[key] = model_spec.reasoning_effort


class Section(BaseModel):
    title: str
    subsections: List[str] = Field(default_factory=list)


class Outline(BaseModel):
    report_title: str
    sections: List[Section]


class OutlineRequest(BaseModel):
    topic: str
    format: Literal["json", "markdown"] = "json"
    model: ModelSpec = ModelSpec(model=DEFAULT_TEXT_MODEL)


class GenerateRequest(BaseModel):
    topic: Optional[str] = None
    mode: Optional[Literal["generate_report"]] = None
    outline: Optional[Outline] = None
    models: Dict[str, ModelSpec] = Field(
        default_factory=lambda: {
            "outline": ModelSpec(model=DEFAULT_TEXT_MODEL),
            "writer": ModelSpec(model=DEFAULT_TEXT_MODEL),
            "translator": ModelSpec(model=DEFAULT_TEXT_MODEL),
            "cleanup": ModelSpec(model="gpt-5-nano"),
        }
    )
    writer_fallback: Optional[str] = None
    return_: Literal["report", "report_with_outline"] = Field(default="report", alias="return")

    @model_validator(mode="after")
    def validate_topic_and_mode(self):
        if self.outline is None:
            if not self.topic:
                raise ValueError("Provide a topic when no outline is supplied.")
            if self.mode != "generate_report":
                raise ValueError("When generating from a topic, mode must be 'generate_report'.")
        return self

