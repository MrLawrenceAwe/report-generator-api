"""API layer exports for running the FastAPI service."""

from .app import app
from .dependencies import (
    get_outline_service,
    get_report_service,
    get_suggestion_service,
)

__all__ = ["app", "get_outline_service", "get_report_service"]
