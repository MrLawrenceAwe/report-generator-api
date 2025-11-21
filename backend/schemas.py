from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

ReasoningEffort = Literal["minimal", "low", "medium", "high"]

DEFAULT_TEXT_MODEL = "gpt-4.1-nano"


class ModelSpec(BaseModel):
    model: str = Field(
        default=DEFAULT_TEXT_MODEL,
        description="Model name, e.g., gpt-4.1-nano, gpt-4o-mini, gpt-4o",
    )
    reasoning_effort: Optional[ReasoningEffort] = Field(default=None, description="Reasoning effort for reasoning models")


class Section(BaseModel):
    title: str
    subsections: List[str] = Field(default_factory=list)


class Outline(BaseModel):
    report_title: str
    sections: List[Section]


def normalize_subject_list(
    values: Optional[List[str]], field_name: str
) -> List[str]:
    if not values:
        return []
    normalized: List[str] = []
    for subject in values:
        cleaned = (subject or "").strip()
        if not cleaned:
            raise ValueError(f"{field_name} entries must contain non-whitespace characters.")
        normalized.append(cleaned)
    return normalized


class SubjectFilters(BaseModel):
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
        description="Force the content to contain exactly this many main sections when provided.",
    )

    @model_validator(mode="after")
    def normalize_subject_filters(self):
        self.subject_inclusions = normalize_subject_list(
            self.subject_inclusions, "subject_inclusions"
        )
        self.subject_exclusions = normalize_subject_list(
            self.subject_exclusions, "subject_exclusions"
        )
        return self


class OutlineRequest(SubjectFilters):
    topic: str
    format: Literal["json", "markdown"] = "json"
    model: ModelSpec = ModelSpec(model=DEFAULT_TEXT_MODEL)

    @model_validator(mode="after")
    def validate_topic(self):
        topic = self.topic.strip()
        if not topic:
            raise ValueError("Topic must contain non-whitespace characters.")
        self.topic = topic
        return self


class GenerateRequest(SubjectFilters):
    topic: Optional[str] = None
    mode: Optional[Literal["generate_report"]] = None
    outline: Optional[Outline] = None
    owner_email: Optional[str] = Field(
        default=None,
        description="Email used to associate generated reports with a user profile.",
    )
    owner_username: Optional[str] = Field(
        default=None,
        description="Optional username stored with the owning user record.",
    )
    models: Dict[str, ModelSpec] = Field(
        default_factory=lambda: {
            "outline": ModelSpec(model=DEFAULT_TEXT_MODEL),
            "writer": ModelSpec(model=DEFAULT_TEXT_MODEL),
            "editor": ModelSpec(model=DEFAULT_TEXT_MODEL),
        }
    )
    writer_fallback: Optional[str] = None
    return_: Literal["report", "report_with_outline"] = Field(default="report", alias="return")

    @model_validator(mode="after")
    def validate_topic_and_mode(self):
        if self.outline is None:
            topic = self.topic.strip() if isinstance(self.topic, str) else ""
            if not topic:
                raise ValueError("Provide a non-empty topic when no outline is supplied.")
            self.topic = topic
            if self.mode != "generate_report":
                raise ValueError("When generating from a topic, mode must be 'generate_report'.")
        if self.owner_email is not None:
            email = self.owner_email.strip()
            if not email:
                raise ValueError("owner_email must contain non-whitespace characters when provided.")
            self.owner_email = email
            if self.owner_username is None or not self.owner_username.strip():
                raise ValueError("Provide owner_username when owner_email is supplied.")
            self.owner_username = self.owner_username.strip()
        elif self.owner_username is not None:
            normalized = self.owner_username.strip()
            self.owner_username = normalized or None
        return self


class SuggestionItem(BaseModel):
    title: str
    source: Literal["guided", "free_roam", "seed"] = "guided"


class SuggestionsRequest(BaseModel):
    topic: Optional[str] = Field(default=None, description="Optional topic anchor for suggestions")
    seeds: List[str] = Field(default_factory=list, description="Additional seed topics/headings to guide suggestions")
    enable_free_roam: bool = Field(
        default=False,
        description="Run a second prompt that roams more broadly when true.",
    )
    include_report_headings: bool = Field(
        default=False,
        description="When true, past report section headings are included as seeds.",
    )
    max_suggestions: int = Field(
        default=12,
        ge=1,
        le=25,
        description="Maximum suggestions to return after merging prompts.",
    )
    model: ModelSpec = Field(
        default_factory=lambda: ModelSpec(model=DEFAULT_TEXT_MODEL),
        description="Model spec used for suggestion prompts.",
    )

    @model_validator(mode="after")
    def normalize_inputs(self):
        topic = (self.topic or "").strip()
        self.topic = topic or None
        normalized_seeds: List[str] = []
        seen = set()
        for seed in self.seeds:
            cleaned = (seed or "").strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized_seeds.append(cleaned)
        self.seeds = normalized_seeds
        return self


class SuggestionsResponse(BaseModel):
    suggestions: List[SuggestionItem] = Field(default_factory=list)
