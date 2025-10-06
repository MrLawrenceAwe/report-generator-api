# Report Generation API

Turn any topic into a structured outline or a polished, audio-friendly report in minutes. This FastAPI service wraps OpenAI's GPT-4o mini models so you can prototype research assistants, voice briefings, and knowledge products without rebuilding prompts or pipelines from scratch.

## Highlights
- **Two outputs, one request**: Ask for an outline to plan your content or a finished report with numbered sections ready for narration.
- **Drop-in FastAPI server**: Comes with typed Pydantic models, streaming helper script, and interactive Swagger docs at `/docs`.
- **Model control built in**: Override the outline, writer, and translator models per request without touching the codebase.
- **Friendly formats**: Receive JSON or markdown for outlines and plain text reports that read cleanly on voice devices.
- **Bring your own key**: Works with any OpenAI-compatible endpoint; point at a proxy by setting one environment variable.

## Why teams use it
- Publish topic briefings for executive updates, customer intelligence, or analyst newsletters.
- Generate speaking scripts or podcast-ready narration from just a topic sentence.
- Feed structured outlines into downstream tools like slide generators or automation workflows.

> ⚠️ Set your OpenAI credential before launching: `export OPENAI_API_KEY=...`

---

## Quickstart

```bash
# 1) (optional) create a virtual environment
python3 -m venv .venv && source .venv/bin/activate

# 2) Install dependencies
pip install -r requirements.txt

# 3) Launch the API (hot reload for local dev)
uvicorn app:app --reload --port 8000
```

---

## Try it now

### Case A — outline only

```bash
python scripts/stream_report.py --outline --topic "Supply chain resilience in 2025"
```

- Writes `Supply chain resilience in 2025 outline.md` (add `--format json` for `... outline.json`).
- Prefer raw HTTP? `curl "http://localhost:8000/outline?topic=..."` works too.

### Case A — full report

```bash
python scripts/stream_report.py --topic "Supply chain resilience in 2025" --show-progress
```

- Streams progress to the terminal and saves `Supply chain resilience in 2025 report.md`.
- Override the destination with `--outfile`.

### Case B — provide your own outline

```bash
python scripts/stream_report.py --payload-file example_requests/caseB_generate_report.json --show-progress
```

### Capture the raw NDJSON stream

```bash
pip install httpx  # once per environment
python scripts/stream_report.py --topic "Modern Data Governance for AI Teams" --show-progress --raw-stream run.ndjson
```

The helper script prints progress, optionally keeps the streamed NDJSON, and always writes the final report to a markdown file.

---

## Endpoint overview

- `POST /outline` — Case A (topic only) → returns an outline (JSON by default).
- `POST /generate_report` — Case A with `mode=generate_report` or Case B (topic + subsections) → returns the final report, optionally alongside the outline used.

### `/outline` request

```jsonc
{
  "topic": "Supply chain resilience in 2025",
  "format": "json",                 // "json" (default) or "markdown"
  "model": {
    "model": "gpt-4o-mini"         // default
  }
}
```

**JSON response**

```json
{
  "report_title": "Supply Chain Resilience in 2025",
  "sections": [
    {"title": "Section 1: ...", "subsections": ["1.1 ...", "1.2 ..."]}
  ]
}
```

> Switch `format` to `markdown` to receive a Markdown outline instead.

### `/generate_report` request

```jsonc
{
  "topic": "Supply chain resilience in 2025",     // required for Case A
  "mode": "generate_report",                      // required for Case A
  "outline": {                                    // optional override; omit to auto-outline
    "report_title": "Supply Chain Resilience in 2025",
    "sections": [
      {"title": "1. Introduction", "subsections": ["1.1 Definition", "1.2 Context"]}
    ]
  },
  "models": {
    "outline":   {"model": "gpt-4o-mini"},
    "writer":    {"model": "gpt-4o-mini"},
    "translator":{"model": "gpt-4o-mini"}
  },
  "writer_fallback": "gpt-4o-mini", // optional; overrides the writer model when provided
  "return": "report"               // "report" (default) or "report_with_outline"
}
```

**Response**

```json
{
  "report_title": "Supply Chain Resilience in 2025",
  "report": "Full audio-friendly narration...",
  "outline_used": {...} // only when return=report_with_outline
}
```

Reports come back as plain text headed by the title line, followed by numbered sections (`1:`) and subsections (`1.1:`) for easy narration.

---

## Configuration

- `OPENAI_API_KEY` — required; the key used for every model call.
- `OPENAI_BASE_URL` — optional; target a proxy or compatible gateway without code changes.

---

## Model notes

- Defaults to GPT-4o mini across outlining, section writing, and translation for consistent tone.
- Requests go through the OpenAI Responses API; reasoning controls are omitted because they are not supported by GPT-4o mini.
- Swap in reasoning-capable models as needed (include `reasoning_effort` in the payload and the server forwards it).

---

## License

MIT
