"""
Compatibility layer that re-exports Explorer's backend modules under the legacy
``report_generator`` namespace. Downstream code that hasn't migrated can keep
importing from ``report_generator`` without breaking.
"""

from __future__ import annotations

import importlib
import sys
from typing import Dict

from backend.models import (
    GenerateRequest,
    ModelSpec,
    Outline,
    OutlineRequest,
    ReasoningEffort,
    Section,
    maybe_add_reasoning,
)

_MODULE_ALIASES: Dict[str, str] = {
    "formatting": "backend.formatting",
    "openai_client": "backend.openai_client",
    "outline_service": "backend.outline_service",
    "prompts": "backend.prompts",
    "report_service": "backend.report_service",
    "report_state": "backend.report_state",
    "summary": "backend.summary",
    "models": "backend.models",
    "db": "backend.db",
    "db.models": "backend.db.models",
    "db.session": "backend.db.session",
}


def _install_aliases() -> None:
    """Populate ``sys.modules`` entries pointing legacy names at backend modules."""

    package = sys.modules[__name__]
    for alias, target in _MODULE_ALIASES.items():
        module = importlib.import_module(target)
        sys.modules[f"{__name__}.{alias}"] = module
        if "." not in alias:
            setattr(package, alias, module)


_install_aliases()

__all__ = [
    "formatting",
    "openai_client",
    "prompts",
    "summary",
    "GenerateRequest",
    "ModelSpec",
    "Outline",
    "OutlineRequest",
    "ReasoningEffort",
    "Section",
    "maybe_add_reasoning",
]
