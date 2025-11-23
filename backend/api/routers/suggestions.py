from fastapi import APIRouter, Depends

from backend.api.dependencies import get_suggestion_service
from backend.schemas import SuggestionsRequest, SuggestionsResponse
from backend.services.suggestion_service import SuggestionService

router = APIRouter()

@router.post("/suggestions")
async def generate_suggestions(
    suggestions_request: SuggestionsRequest,
    suggestion_service: SuggestionService = Depends(get_suggestion_service),
) -> SuggestionsResponse:
    return await suggestion_service.generate(suggestions_request)
