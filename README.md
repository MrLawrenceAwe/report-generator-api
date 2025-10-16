# Report Generator API

Turn any topic into a structured outline or a polished, audio-friendly report in minutes.

---

## Set your OpenAI credential

The FastAPI service (`uvicorn app:app`) calls OpenAI’s API through the official Python SDK, so it needs your credential. Set these environment variables _in the shell that launches the server_ (and in any other process that will contact OpenAI on your behalf):

```bash
export OPENAI_API_KEY="sk-your-key"
# Optional: point at a proxy or gateway
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

If you prefer to avoid exporting variables manually, drop them in a `.env` file and source it (`source .env`) before starting the API. When running commands inline, you can also prefix them:

```bash
OPENAI_API_KEY="sk-your-key" uvicorn app:app --reload --port 8000
python client/stream_report.py --topic "Future of urban farming"
```

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

## Run the helper client

`client/stream_report.py` streams status updates to your terminal, saves finished artifacts under `client/generated_reports/`, and can optionally persist the raw NDJSON stream. It simply hits the API endpoint you configure (default `http://localhost:8000/generate_report`), so no OpenAI credential is required unless the server you are pointing at expects one in its own environment. Override any defaults with CLI flags or feed a full JSON payload via `--payload-file`.

### Outline from a topic

```bash
python client/stream_report.py --outline --topic "Supply chain resilience in 2025"
```

- Produces `client/generated_reports/Supply chain resilience in 2025 outline.md` (add `--format json` to switch to JSON).
- REST payload twin: `example_requests/outline_from_topic.json`.

### Report from only a topic (auto-generated outline)

```bash
python client/stream_report.py --topic "Supply chain resilience in 2025" --show-progress
```

- Streams progress and saves `client/generated_reports/Supply chain resilience in 2025 report.md`.
- Use `example_requests/report_from_topic.json` to issue the same request over HTTP or via another client.

### Report with your outline

```bash
python client/stream_report.py --payload-file example_requests/report_with_custom_outline.json --show-progress
```

- Reuses your outline and returns both the outline and finished report (`return="report_with_outline"` in the payload).

### Report with custom models

```bash
python client/stream_report.py --payload-file example_requests/report_with_custom_models.json --show-progress
```

- Edit the `models` block in the JSON file to target specific OpenAI models (outline → writer → translator → cleanup). Include `reasoning_effort` when using reasoning-capable models (names starting with `gpt-5`, `o3`, or `o4`).
- Fields you omit fall back to the defaults described under `/generate_report`.

### Capture the raw NDJSON stream

```bash
pip install httpx  # once per environment
python client/stream_report.py --topic "Modern Data Governance for AI Teams" --show-progress --raw-stream run.ndjson
```

---

## API endpoints

- `POST /outline` — Generate just the outline from a topic (see `example_requests/outline_from_topic.json`).
- `POST /generate_report` — Produce the full report, optionally supplying a custom outline or model overrides (`example_requests/report_from_topic.json`, `report_with_custom_outline.json`, `report_with_custom_models.json`).

### `/outline` request

**Example request payload**

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

**Example request payload**

```jsonc
{
  "topic": "Supply chain resilience in 2025",
  "mode": "generate_report",
  "outline": {
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
  "writer_fallback": "gpt-4o-mini",
  "return": "report"
}
```

**Response**

```json
{
  "report_title": "Supply Chain Resilience in 2025",
  "report": "Full audio-friendly narration...",
  "outline_used": {...}
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
