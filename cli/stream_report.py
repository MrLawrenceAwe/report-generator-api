#!/usr/bin/env python3
"""Call the report generation API and stream progress for full reports."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, TextIO

CLI_DIR = Path(__file__).resolve().parent
CLIENTS_DIR = CLI_DIR.parent
GENERATED_REPORTS_DIR = CLI_DIR / 'generated_reports'

try:
    import httpx
except ImportError as exception:  # pragma: no cover - dependency check
    raise SystemExit("httpx is required to run this script (pip install httpx)") from exception

from pydantic import ValidationError

from backend.schemas import GenerateRequest, normalize_subject_list


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call the report generation API to stream a finished report.",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000/generate_report",
        help="Endpoint to call (default: %(default)s).",
    )
    parser.add_argument(
        "--payload-file",
        type=Path,
        help="Path to a JSON file containing the POST body. Overrides --topic when provided.",
    )
    parser.add_argument(
        "--topic",
        help="Topic to request when a payload file is not provided (payload defaults to Case A).",
    )
    parser.add_argument(
        "--outfile",
        type=Path,
        default=None,
        help="Where to write the output. Defaults to report.md within cli/generated_reports/.",
    )
    parser.add_argument(
        "--raw-stream",
        type=Path,
        help="Optional path to store the raw NDJSON stream for debugging.",
    )
    parser.add_argument(
        "--show-progress",
        action="store_true",
        help="Print each streamed event to stdout as it arrives.",
    )
    parser.add_argument(
        "--sections",
        type=int,
        help="Force outlines or generated reports to contain exactly this many main sections.",
    )
    parser.add_argument(
        "--subject-inclusion",
        dest="subject_inclusions",
        action="append",
        help="Require the outline/report to cover this subject. Pass multiple times for multiple subjects.",
    )
    parser.add_argument(
        "--subject-exclusion",
        dest="subject_exclusions",
        action="append",
        help="Avoid this subject entirely. Pass multiple times for multiple subjects.",
    )
    parser.add_argument(
        "--owner-email",
        help="Email used to associate the generated artifacts with a user profile.",
    )
    parser.add_argument(
        "--owner-username",
        help="Username to store for the owner when --owner-email is provided (required whenever an owner email is supplied).",
    )
    return parser.parse_args()


_SAFE_STEM_RE = re.compile(r"[^0-9A-Za-z _-]+")


def _safe_topic_stem(topic: str) -> str:
    stem = _SAFE_STEM_RE.sub("", topic).strip()
    if stem:
        return stem
    return "report"


def _default_report_outfile(topic: str) -> Path:
    stem = _safe_topic_stem(topic)
    base_dir = GENERATED_REPORTS_DIR
    return base_dir / f"{stem} report.md"


def _normalize_subject_args(values: Optional[List[str]], flag_name: str) -> List[str]:
    try:
        return normalize_subject_list(values, flag_name)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


def _load_json_mapping(payload_file: Path) -> Dict[str, Any]:
    text = payload_file.read_text(encoding="utf-8")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SystemExit(
            f"Payload file '{payload_file}' must contain valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise SystemExit(
            "Payload file must contain a JSON object (mapping of field names to values)."
        )
    return data


def _infer_topic(payload: Dict[str, Any]) -> str | None:
    topic = payload.get("topic")
    if isinstance(topic, str) and topic.strip():
        return topic
    outline = payload.get("outline")
    if isinstance(outline, dict):
        title = outline.get("report_title")
        if isinstance(title, str) and title.strip():
            return title
    return None


def _apply_generation_options(
    payload: Dict[str, Any],
    sections: int | None,
    subject_inclusions: Optional[List[str]],
    subject_exclusions: Optional[List[str]],
) -> Dict[str, Any]:
    merged_payload = dict(payload)
    if sections is not None:
        merged_payload["sections"] = sections
    if subject_inclusions:
        merged_payload["subject_inclusions"] = subject_inclusions
    if subject_exclusions:
        merged_payload["subject_exclusions"] = subject_exclusions
    return merged_payload


def _apply_owner_metadata(
    payload: Dict[str, Any],
    owner_email: Optional[str],
    owner_username: Optional[str],
) -> Dict[str, Any]:
    merged = dict(payload)
    if owner_email:
        merged["owner_email"] = owner_email
    if owner_username:
        merged["owner_username"] = owner_username
    return merged


def _validate_generate_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        request = GenerateRequest.model_validate(payload)
    except ValidationError as exc:
        raise SystemExit(f"Invalid report payload: {exc}") from exc
    return request.model_dump(by_alias=True)


def load_payload(
    payload_file: Path | None,
    topic: str | None,
    sections: int | None = None,
    subject_inclusions: Optional[List[str]] = None,
    subject_exclusions: Optional[List[str]] = None,
    owner_email: Optional[str] = None,
    owner_username: Optional[str] = None,
) -> Dict[str, Any]:
    if payload_file is not None:
        data = _load_json_mapping(payload_file)
        payload = _apply_generation_options(
            data,
            sections,
            subject_inclusions,
            subject_exclusions,
        )
        payload = _apply_owner_metadata(payload, owner_email, owner_username)
        validated = _validate_generate_payload(payload)
        _enforce_owner_metadata_requirements(validated, owner_email=owner_email)
        return validated

    if topic is None:
        raise SystemExit("Provide --topic when --payload-file is omitted.")
    payload: Dict[str, Any] = {"topic": topic, "mode": "generate_report"}
    payload = _apply_generation_options(
        payload,
        sections,
        subject_inclusions,
        subject_exclusions,
    )
    payload = _apply_owner_metadata(payload, owner_email, owner_username)
    validated = _validate_generate_payload(payload)
    _enforce_owner_metadata_requirements(validated, owner_email=owner_email)
    return validated


def _enforce_owner_metadata_requirements(
    payload: Dict[str, Any],
    *,
    owner_email: Optional[str],
) -> None:
    # Topics provided via CLI defaults represent interactive runs where we expect explicit owner metadata.
    # Outline-driven payloads (with pre-supplied outlines) may be auto-generated system runs and remain optional.
    has_outline = isinstance(payload.get("outline"), dict)
    if not has_outline and owner_email:
        if not payload.get("owner_username"):
            raise SystemExit("--owner-username must accompany --owner-email when override flags are provided.")


def _prepare_final_report(final_event: Dict[str, Any]) -> str:
    status = final_event.get("status")
    if status != "complete":
        detail_parts = [
            "Report generation did not complete successfully.",
            f"Final status: {status!r}",
        ]
        detail = final_event.get("detail")
        if detail:
            detail_parts.append(f"Detail: {detail}")
        section = final_event.get("section")
        if section:
            detail_parts.append(f"Section: {section}")
        detail_parts.append("Final event: " + json.dumps(final_event, indent=2))
        raise SystemExit("\n".join(detail_parts))
    report = final_event.get("report")
    if not isinstance(report, str):
        raise SystemExit(
            "Final payload did not contain a 'report' field. "
            + json.dumps(final_event, indent=2)
        )
    return report


def _write_text_file(path: Path, contents: str, message: str, show_message: bool = True) -> None:
    """Write ``contents`` to ``path`` and optionally log ``message``."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")
    if show_message:
        print(message)


def _collect_stream_events(
    response: httpx.Response,
    raw_stream_handle: TextIO | None,
    show_progress: bool,
) -> Dict[str, Any]:
    final_event: Dict[str, Any] | None = None
    for line in response.iter_lines():
        if line is None:
            continue
        line = line.strip()
        if not line:
            continue
        if raw_stream_handle:
            raw_stream_handle.write(line + "\n")
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            if show_progress:
                print(line)
            continue
        if show_progress:
            event_for_display = event
            if event.get("status") == "complete" and "report" in event:
                event_for_display = {k: v for k, v in event.items() if k != "report"}
            print(json.dumps(event_for_display))
        final_event = event

    if not final_event:
        raise SystemExit("Stream ended without a JSON payload to write.")

    return final_event


def _stream_report(
    url: str,
    payload: Dict[str, Any],
    raw_stream: Path | None,
    show_progress: bool,
) -> Dict[str, Any]:
    raw_stream_handle: TextIO | None = None
    try:
        if raw_stream:
            raw_stream.parent.mkdir(parents=True, exist_ok=True)
            raw_stream_handle = raw_stream.open("w", encoding="utf-8")

        with httpx.Client(timeout=None) as client:
            with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                return _collect_stream_events(
                    response, raw_stream_handle, show_progress
                )
    finally:
        if raw_stream_handle:
            raw_stream_handle.close()


def main() -> None:
    args = parse_args()
    if args.sections is not None and args.sections < 1:
        raise SystemExit("--sections must be greater than or equal to 1.")
    subject_inclusions = _normalize_subject_args(
        args.subject_inclusions, "--subject-inclusion"
    )
    subject_exclusions = _normalize_subject_args(
        args.subject_exclusions, "--subject-exclusion"
    )
    payload = load_payload(
        args.payload_file,
        args.topic,
        sections=args.sections,
        subject_inclusions=subject_inclusions,
        subject_exclusions=subject_exclusions,
        owner_email=args.owner_email,
        owner_username=args.owner_username,
    )

    inferred_topic = _infer_topic(payload)
    default_outfile = (
        _default_report_outfile(inferred_topic)
        if inferred_topic
        else GENERATED_REPORTS_DIR / "report.md"
    )
    outfile = args.outfile or default_outfile
    final_event = _stream_report(
        args.url,
        payload,
        args.raw_stream,
        args.show_progress,
    )

    report = _prepare_final_report(final_event)

    _write_text_file(outfile, report, f"Report generation complete. Saved to {outfile}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:  # pragma: no cover - CLI ergonomics
        sys.exit(130)
