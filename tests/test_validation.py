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


def test_outline_request_rejects_blank_topic():
    with pytest.raises(ValidationError) as excinfo:
        OutlineRequest.model_validate({"topic": "   "})

    assert "non-whitespace" in str(excinfo.value)


def test_outline_service_build_outline_request_strips_topic():
    outline_request = OutlineService.build_outline_request(
        "  Climate Adaptation  ",
        "json",
        model_name=None,
        reasoning_effort=None,
    )

    assert outline_request.topic == "Climate Adaptation"


def test_outline_service_build_outline_request_rejects_blank_topic():
    with pytest.raises(ValueError) as excinfo:
        OutlineService.build_outline_request(
            "   ",
            "json",
            model_name=None,
            reasoning_effort=None,
        )

    assert "non-whitespace" in str(excinfo.value)
