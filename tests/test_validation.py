import pytest
from pydantic import ValidationError

from report_generator.models import GenerateRequest, OutlineRequest
from report_generator.outline_service import OutlineService


def test_generate_request_requires_non_empty_topic_when_no_outline():
    with pytest.raises(ValidationError) as excinfo:
        GenerateRequest.model_validate({"topic": "   ", "mode": "generate_report"})

    assert "non-empty topic" in str(excinfo.value)


def test_generate_request_strips_topic_whitespace():
    request = GenerateRequest.model_validate({"topic": "  Quantum Computing  ", "mode": "generate_report"})

    assert request.topic == "Quantum Computing"


def test_generate_request_accepts_sections_hint():
    request = GenerateRequest.model_validate(
        {"topic": "Quantum Computing", "mode": "generate_report", "sections": 3}
    )

    assert request.sections == 3


def test_outline_request_rejects_blank_topic():
    with pytest.raises(ValidationError) as excinfo:
        OutlineRequest.model_validate({"topic": "   "})

    assert "non-whitespace" in str(excinfo.value)


def test_outline_request_rejects_invalid_sections():
    with pytest.raises(ValidationError) as excinfo:
        OutlineRequest.model_validate({"topic": "AI Safety", "sections": 0})

    assert "greater than or equal to 1" in str(excinfo.value)


def test_outline_service_build_outline_request_strips_topic():
    outline_request = OutlineService.build_outline_request(
        "  Climate Adaptation  ",
        "json",
        model_name=None,
        reasoning_effort=None,
    )

    assert outline_request.topic == "Climate Adaptation"


def test_outline_service_build_outline_request_applies_sections():
    outline_request = OutlineService.build_outline_request(
        "  Climate Adaptation  ",
        "json",
        model_name=None,
        reasoning_effort=None,
        sections=4,
    )

    assert outline_request.sections == 4


def test_outline_service_build_outline_request_rejects_blank_topic():
    with pytest.raises(ValueError) as excinfo:
        OutlineService.build_outline_request(
            "   ",
            "json",
            model_name=None,
            reasoning_effort=None,
        )

    assert "non-whitespace" in str(excinfo.value)
