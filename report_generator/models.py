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


def _normalize_subjects(values: List[str], field_name: str) -> List[str]:
    normalized: List[str] = []
    for subject in values:
        cleaned = subject.strip()
        if not cleaned:
            raise ValueError(f"{field_name} entries must contain non-whitespace characters.")
        normalized.append(cleaned)
    return normalized


class OutlineRequest(BaseModel):
    topic: str
    format: Literal["json", "markdown"] = "json"
    model: ModelSpec = ModelSpec(model=DEFAULT_TEXT_MODEL)
    subject_inclusions: List[str] = Field(
        default_factory=list,
        description="Subjects that must be covered; defaults to none.",
    )
    subject_exclusions: List[str] = Field(
        default_factory=list,
        description="Subjects that must be avoided; defaults to none.",
    )
    sections: Optional[int] = Field(
        default=None,
        ge=1,
        description="Force the outline to contain exactly this many main sections.",
    )

    @model_validator(mode="after")
    def validate_topic(self):
        topic = self.topic.strip()
        if not topic:
            raise ValueError("Topic must contain non-whitespace characters.")
        self.topic = topic
        self.subject_inclusions = _normalize_subjects(
            self.subject_inclusions, "subject_inclusions"
        )
        self.subject_exclusions = _normalize_subjects(
            self.subject_exclusions, "subject_exclusions"
        )
        return self


class GenerateRequest(BaseModel):
    topic: Optional[str] = None
    mode: Optional[Literal["generate_report"]] = None
    outline: Optional[Outline] = None
    subject_inclusions: List[str] = Field(
        default_factory=list,
        description="Subjects that must be covered; defaults to none.",
    )
    subject_exclusions: List[str] = Field(
        default_factory=list,
        description="Subjects that must be avoided; defaults to none.",
    )
    sections: Optional[int] = Field(
        default=None,
        ge=1,
        description="When no outline is provided, request an outline with this many sections.",
    )
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
        self.subject_inclusions = _normalize_subjects(
            self.subject_inclusions, "subject_inclusions"
        )
        self.subject_exclusions = _normalize_subjects(
            self.subject_exclusions, "subject_exclusions"
        )
        if self.outline is None:
            topic = self.topic.strip() if isinstance(self.topic, str) else ""
            if not topic:
                raise ValueError("Provide a non-empty topic when no outline is supplied.")
            self.topic = topic
            if self.mode != "generate_report":
                raise ValueError("When generating from a topic, mode must be 'generate_report'.")
        return self
