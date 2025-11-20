import asyncio
import json
from pathlib import Path

import pytest

from backend.schemas import SuggestionsRequest
from backend.services.suggestion_service import SuggestionService


class StubTextClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    async def call_text_async(self, model_spec, system_prompt, user_prompt, style_hint=None):
        self.calls.append((model_spec.model, system_prompt, user_prompt))
        if not self._responses:
            raise AssertionError("No stubbed responses left")
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.mark.asyncio
async def test_suggestions_merge_and_dedupe(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("EXPLORER_DATABASE_URL", f"sqlite:///{tmp_path}/suggestions.db")
    guided = json.dumps(
        {
            "suggestions": [
                {"title": "Quantum Algorithms"},
                {"title": "quantum algorithms"},
            ]
        }
    )
    free_roam = json.dumps(
        [
            {"title": "Error Correction"},
            "Quantum Hardware",
        ]
    )
    client = StubTextClient([guided, free_roam])
    service = SuggestionService(text_client=client, session_factory=None)

    request = SuggestionsRequest(
        topic="Quantum Computing",
        seeds=["qubits", "future of quantum computers"],
        enable_free_roam=True,
        max_suggestions=5,
    )
    response = await service.generate(request)

    titles = [item.title for item in response.suggestions]
    assert "Quantum Algorithms" in titles
    assert "Error Correction" in titles
    assert "Quantum Hardware" in titles
    assert len(titles) == len(set(titles)), "Duplicates should be removed"
