#!/usr/bin/env python3
"""Call the report generation API to fetch either a streamed report or an outline."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Literal

import re

CLIENT_DIR = Path(__file__).resolve().parent
GENERATED_REPORTS_DIR = CLIENT_DIR / 'generated_reports'

try:
    import httpx
except ImportError as exception:  # pragma: no cover - dependency check
    raise SystemExit("httpx is required to run this script (pip install httpx)") from exception


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


def load_payload(payload_file: Path | None, topic: str | None) -> Dict[str, Any]:
    if payload_file is not None:
        text = payload_file.read_text(encoding="utf-8")
        data = json.loads(text)
        if not isinstance(data, dict):
            raise SystemExit(
                "Payload file must contain a JSON object (mapping of field names to values)."
            )
        return data
    if topic is None:
        raise SystemExit("Provide --topic when --payload-file is omitted.")
    return {"topic": topic, "mode": "generate_report"}


def _write_text_file(path: Path, contents: str, message: str, show_message: bool = True) -> None:
    """Write ``contents`` to ``path`` and optionally log ``message``."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")
    if show_message:
        print(message)


def main() -> None:
    args = parse_args()
    if args.outline:
        if args.topic is None:
            raise SystemExit("Provide --topic when requesting an outline.")
        target = args.url
        if target.endswith("/generate_report"):
            target = target.rsplit("/", 1)[0] + "/generate_outline"

        outfile = args.outfile
        if outfile is None:
            outfile = _default_outfile(args.topic, "outline", args.format)

        params: Dict[str, Any] = {"topic": args.topic, "format": args.format}

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

    payload = load_payload(args.payload_file, args.topic)

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
                    if args.show_progress:
                        print(line)
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    final_event = event
    finally:
        if raw_stream_handle:
            raw_stream_handle.close()

    if not final_event:
        raise SystemExit("Stream ended without a JSON payload to write.")

    report = final_event.get("report")
    if not isinstance(report, str):
        raise SystemExit("Final payload did not contain a 'report' field.")

    _write_text_file(outfile, report, f"Report generation complete. Saved to {outfile}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:  # pragma: no cover - CLI ergonomics
        sys.exit(130)
