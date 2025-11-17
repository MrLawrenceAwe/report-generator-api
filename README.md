# Explorer

Turn any topic into a structured outline or a polished, audio-friendly report in minutes.

---

## Project layout

- `backend/` — FastAPI APIs plus report generation domain logic, prompts, and persistence helpers (see `backend/api` for the HTTP layer).
- `clients/cli/` — helper CLI tooling for hitting the API and saving generated artifacts.
- `clients/frontend/` — placeholder for the future browser-based surface (see `clients/frontend/README.md`).

---

## Set your OpenAI credential

The Explorer FastAPI service (`uvicorn backend.api.app:app`, or the legacy `uvicorn app:app` entry point) calls OpenAI’s API through the official Python SDK, so it needs your credential. Set these environment variables _in the shell that launches the server_ (and in any other process that will contact OpenAI on your behalf):

```bash
export OPENAI_API_KEY="sk-your-key"
# Optional: point at a proxy or gateway
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

If you prefer to avoid exporting variables manually, drop them in a `.env` file and source it (`source .env`) before starting the API. When running commands inline, you can also prefix them:

```bash
OPENAI_API_KEY="sk-your-key" uvicorn backend.api.app:app --reload --port 8000
python clients/cli/stream_report.py --topic "Future of urban farming"
```

---

## Quickstart

```bash
# 1) (optional) create a virtual environment
python3 -m venv .venv && source .venv/bin/activate

# 2) Install dependencies
pip install -r requirements.txt

# 3) Launch the API (hot reload for local dev)
uvicorn backend.api.app:app --reload --port 8000
```

---

## Run the helper CLI

`clients/cli/stream_report.py` streams status updates to your terminal, saves finished artifacts under `clients/cli/generated_reports/`, and can optionally persist the raw NDJSON stream. It simply hits the API endpoint you configure (default `http://localhost:8000/generate_report`), so no OpenAI credential is required unless the server you are pointing at expects one in its own environment. Override any defaults with CLI flags or feed a full JSON payload via `--payload-file`.
Add `--sections 4` (or any positive integer) to the outline/report commands below when you want to force the generated outline to contain exactly four main sections.

## Data model foundation

The domain entities for `User`, `Topic`, and `Report` live in `backend/db/models.py`. They are standard SQLAlchemy 2.0 ORM classes with forward-looking metadata (embeddings, tags, timestamps, etc.). To get started in your own service:

```python
from backend.db import Base, create_engine_from_url, create_session_factory

# Simple SQLite file for local/dev usage
engine = create_engine_from_url("sqlite:///reportgen.db")
Base.metadata.create_all(engine)
SessionFactory = create_session_factory(engine)
```

Use `backend.db.session_scope` whenever you need a short-lived transactional scope in scripts or background jobs. When you're ready to move beyond SQLite, install the appropriate driver for your target database (e.g., `psycopg[binary]` for PostgreSQL) and swap the connection URL accordingly.

### Outline from a topic

```bash
python clients/cli/stream_report.py --outline --topic "Supply chain resilience in 2025"
```

- Produces `clients/cli/generated_reports/Supply chain resilience in 2025 outline.md` (add `--format json` to switch to JSON).
- REST payload twin: `example_requests/outline_from_topic.json`.

### Report from only a topic (auto-generated outline)

```bash
python clients/cli/stream_report.py --topic "Supply chain resilience in 2025" --show-progress
```

- Streams progress and saves `clients/cli/generated_reports/Supply chain resilience in 2025 report.md`.
- Use `example_requests/report_from_topic.json` to issue the same request over HTTP or via another client.

### Report with your outline

```bash
python clients/cli/stream_report.py --payload-file example_requests/report_with_custom_outline.json --show-progress
```

- Reuses your outline and returns both the outline and finished report (`return="report_with_outline"` in the payload).

### Report with custom models

```bash
python clients/cli/stream_report.py --payload-file example_requests/report_with_custom_models.json --show-progress
```

- Edit the `models` block in the JSON file to target specific OpenAI models (outline → writer → translator → cleanup). Include `reasoning_effort` when using reasoning-capable models (names starting with `gpt-5`, `o3`, or `o4`).
- Fields you omit fall back to the defaults described under `/generate_report`.

### Capture the raw NDJSON stream

```bash
pip install httpx  # once per environment
python clients/cli/stream_report.py --topic "Modern Data Governance for AI Teams" --show-progress --raw-stream run.ndjson
```

---

## API endpoints

- `GET/POST /generate_outline` — Generate just the outline from a topic (see `example_requests/outline_from_topic.json`).
- `POST /generate_report` — Produce the full report, optionally supplying a custom outline or model overrides (`example_requests/report_from_topic.json`, `report_with_custom_outline.json`, `report_with_custom_models.json`).

### `/generate_outline` request

**Example request payload**

```jsonc
{
  "topic": "Supply chain resilience in 2025",
  "sections": 4,                   // optional: force this many main sections
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

> Switch `format` to `markdown` to receive a Markdown outline instead. Provide the same parameters as query string values for the GET variant.
> The `sections` field works with both JSON bodies and GET query params.

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
When you omit the `outline` block, include `sections` in your payload to have the auto-generated outline honor that exact count.

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
