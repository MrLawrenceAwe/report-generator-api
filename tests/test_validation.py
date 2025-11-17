import pytest
from pydantic import ValidationError

from backend.models import GenerateRequest, OutlineRequest
from backend.outline_service import OutlineService


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


def test_generate_request_subject_lists_trimmed():
    request = GenerateRequest.model_validate(
        {
            "topic": "Quantum Computing",
            "mode": "generate_report",
            "subject_inclusions": ["  quantum supremacy  "],
            "subject_exclusions": [" hype "],
        }
    )

    assert request.subject_inclusions == ["quantum supremacy"]
    assert request.subject_exclusions == ["hype"]


def test_generate_request_rejects_blank_subject_entries():
    with pytest.raises(ValidationError) as excinfo:
        GenerateRequest.model_validate(
            {
                "topic": "Quantum Computing",
                "mode": "generate_report",
                "subject_inclusions": ["ok"],
                "subject_exclusions": ["   "],
            }
        )

    assert "subject_exclusions" in str(excinfo.value)


def test_outline_request_rejects_blank_topic():
    with pytest.raises(ValidationError) as excinfo:
        OutlineRequest.model_validate({"topic": "   "})

    assert "non-whitespace" in str(excinfo.value)


def test_outline_request_rejects_invalid_sections():
    with pytest.raises(ValidationError) as excinfo:
        OutlineRequest.model_validate({"topic": "AI Safety", "sections": 0})

    assert "greater than or equal to 1" in str(excinfo.value)


def test_outline_request_validates_subject_lists():
    outline_request = OutlineRequest.model_validate(
        {
            "topic": "AI Safety",
            "subject_inclusions": ["  robotics  "],
            "subject_exclusions": [" hype "],
        }
    )

    assert outline_request.subject_inclusions == ["robotics"]
    assert outline_request.subject_exclusions == ["hype"]


def test_outline_request_rejects_blank_subject_entries():
    with pytest.raises(ValidationError) as excinfo:
        OutlineRequest.model_validate(
            {"topic": "AI Safety", "subject_inclusions": ["   "]}
        )

    assert "subject_inclusions" in str(excinfo.value)


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


def test_outline_service_build_outline_request_passes_subject_filters():
    outline_request = OutlineService.build_outline_request(
        "Climate Adaptation",
        "json",
        model_name=None,
        reasoning_effort=None,
        subject_inclusions=[" coastal defenses "],
        subject_exclusions=[" fossil fuels "],
    )

    assert outline_request.subject_inclusions == ["coastal defenses"]
    assert outline_request.subject_exclusions == ["fossil fuels"]


def test_outline_service_build_outline_request_rejects_blank_topic():
    with pytest.raises(ValueError) as excinfo:
        OutlineService.build_outline_request(
            "   ",
            "json",
            model_name=None,
            reasoning_effort=None,
        )

    assert "non-whitespace" in str(excinfo.value)


def test_generate_request_requires_owner_username_with_owner_email():
    with pytest.raises(ValidationError) as excinfo:
        GenerateRequest.model_validate(
            {
                "topic": "Quantum Computing",
                "mode": "generate_report",
                "owner_email": "owner@example.com",
            }
        )

    assert "owner_username" in str(excinfo.value)


def test_generate_request_strips_owner_username():
    request = GenerateRequest.model_validate(
        {
            "topic": "Quantum Computing",
            "mode": "generate_report",
            "owner_email": "owner@example.com",
            "owner_username": "  Owner Name ",
        }
    )

    assert request.owner_username == "Owner Name"
