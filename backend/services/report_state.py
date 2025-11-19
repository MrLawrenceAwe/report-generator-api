from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from backend.models import ModelSpec


@dataclass
class NumberedSection:
    title: str
    subsections: List[str]


@dataclass
class WrittenSection:
    title: str
    body: str


@dataclass
class WriterState:
    primary: ModelSpec
    fallback: Optional[ModelSpec]
    active: ModelSpec
    using_fallback: bool = False

    @classmethod
    def build(cls, primary: ModelSpec, fallback: Optional[ModelSpec]) -> "WriterState":
        return cls(primary=primary, fallback=fallback, active=primary)

    def activate_fallback(self) -> bool:
        if self.fallback and not self.using_fallback:
            self.using_fallback = True
            self.active = self.fallback
            return True
        return False
