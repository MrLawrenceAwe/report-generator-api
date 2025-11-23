from backend.api.app import app
from backend.api.dependencies import (
    get_outline_service,
    get_report_service,
    get_suggestion_service,
)

__all__ = ["app", "get_outline_service", "get_report_service", "get_suggestion_service"]
