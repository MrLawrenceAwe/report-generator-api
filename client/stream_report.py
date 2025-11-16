#!/usr/bin/env python3
"""Call the report generation API to fetch either a streamed report or an outline."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

CLIENT_DIR = Path(__file__).resolve().parent
GENERATED_REPORTS_DIR = CLIENT_DIR / 'generated_reports'

try:
    import httpx
except ImportError as exception:  # pragma: no cover - dependency check
    raise SystemExit("httpx is required to run this script (pip install httpx)") from exception

from pydantic import ValidationError

REPO_ROOT = CLIENT_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from report_generator.models import GenerateRequest, OutlineRequest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call the report generation API for either a full report or an outline.",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000/generate_report",
        help="Endpoint to call (default: %(default)s). Automatically adjusted to /generate_outline when --outline is passed.",
    )
    parser.add_argument(
        "--outline",
        action="store_true",
        help="Fetch an outline instead of streaming a full report.",
    )
    parser.add_argument(
        "--format",
        choices=("json", "markdown"),
        default="markdown",
        help="Outline format when --outline is used (default: %(default)s).",
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
        help="Where to write the output. Defaults to report.md for reports, outline.json or outline.md for outlines.",
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
    return parser.parse_args()


_SAFE_STEM_RE = re.compile(r"[^0-9A-Za-z _-]+")


def _safe_topic_stem(topic: str) -> str:
    stem = _SAFE_STEM_RE.sub("", topic).strip()
    if stem:
        return stem
    return "report"


def _default_outfile(topic: str, kind: Literal["report", "outline"], outline_format: str = "markdown") -> Path:
    stem = _safe_topic_stem(topic)
    base_dir = GENERATED_REPORTS_DIR
    if kind == "report":
        return base_dir / f"{stem} report.md"
    suffix = "md" if outline_format == "markdown" else "json"
    return base_dir / f"{stem} outline.{suffix}"


def _normalize_subject_args(values: Optional[List[str]], flag_name: str) -> List[str]:
    if not values:
        return []
    normalized: List[str] = []
    for value in values:
        trimmed = (value or "").strip()
        if not trimmed:
            raise SystemExit(f"{flag_name} entries must contain non-whitespace characters.")
        normalized.append(trimmed)
    return normalized


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


def load_payload(
    payload_file: Path | None,
    topic: str | None,
    sections: int | None = None,
    subject_inclusions: Optional[List[str]] = None,
    subject_exclusions: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if payload_file is not None:
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
        if sections is not None:
            data["sections"] = sections
        if subject_inclusions:
            data["subject_inclusions"] = subject_inclusions
        if subject_exclusions:
            data["subject_exclusions"] = subject_exclusions
        try:
            GenerateRequest.model_validate(data)
        except ValidationError as exc:
            raise SystemExit(f"Invalid report payload: {exc}") from exc
        return data

    if topic is None:
        raise SystemExit("Provide --topic when --payload-file is omitted.")
    payload: Dict[str, Any] = {"topic": topic, "mode": "generate_report"}
    if sections is not None:
        payload["sections"] = sections
    if subject_inclusions:
        payload["subject_inclusions"] = subject_inclusions
    if subject_exclusions:
        payload["subject_exclusions"] = subject_exclusions

    try:
        request = GenerateRequest.model_validate(payload)
    except ValidationError as exc:
        raise SystemExit(f"Invalid report payload: {exc}") from exc
    return request.model_dump(by_alias=True)


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
    if args.outline:
        if args.topic is None:
            raise SystemExit("Provide --topic when requesting an outline.")
        target = args.url
        if target.endswith("/generate_report"):
            target = target.rsplit("/", 1)[0] + "/generate_outline"

        outfile = args.outfile
        if outfile is None:
            outfile = _default_outfile(args.topic, "outline", args.format)

        try:
            outline_request = OutlineRequest.model_validate(
                {
                    "topic": args.topic,
                    "format": args.format,
                    "sections": args.sections,
                    "subject_inclusions": subject_inclusions,
                    "subject_exclusions": subject_exclusions,
                }
            )
        except ValidationError as exc:
            raise SystemExit(f"Invalid outline request: {exc}") from exc

        params = outline_request.model_dump(
            exclude={"model"},
            exclude_none=True,
        )

        with httpx.Client(timeout=None) as client:
            response = client.get(target, params=params)
            response.raise_for_status()
            data = response.json()

        if args.format == "json":
            output_text = json.dumps(data, indent=2) + "\n"
        else:
            markdown = data.get("markdown_outline")
            if not isinstance(markdown, str):
                raise SystemExit("Outline response missing 'markdown_outline'.")
            output_text = markdown.strip() + "\n"

        _write_text_file(outfile, output_text, f"Saved outline to {outfile}")
        return

    payload = load_payload(
        args.payload_file,
        args.topic,
        sections=args.sections,
        subject_inclusions=subject_inclusions,
        subject_exclusions=subject_exclusions,
    )

    inferred_topic = _infer_topic(payload)
    default_outfile = _default_outfile(inferred_topic, "report") if inferred_topic else GENERATED_REPORTS_DIR / 'report.md'
    outfile = args.outfile or default_outfile
    final_event: Dict[str, Any] | None = None
    raw_stream_handle = None
    if args.raw_stream:
        args.raw_stream.parent.mkdir(parents=True, exist_ok=True)
        raw_stream_handle = args.raw_stream.open("w", encoding="utf-8")

    try:
        with httpx.Client(timeout=None) as client:
            with client.stream("POST", args.url, json=payload) as response:
                response.raise_for_status()
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
                        if args.show_progress:
                            print(line)
                        continue
                    if args.show_progress:
                        event_for_display = event
                        if event.get("status") == "complete" and "report" in event:
                            event_for_display = {k: v for k, v in event.items() if k != "report"}
                        print(json.dumps(event_for_display))
                    final_event = event
    finally:
        if raw_stream_handle:
            raw_stream_handle.close()

    if not final_event:
        raise SystemExit("Stream ended without a JSON payload to write.")

    report = _prepare_final_report(final_event)

    _write_text_file(outfile, report, f"Report generation complete. Saved to {outfile}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:  # pragma: no cover - CLI ergonomics
        sys.exit(130)
