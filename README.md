# Explorer

Turn any topic into a polished, audio-friendly report anchored by a structured outline.

---

## Project layout

- `backend/` — FastAPI APIs plus report generation domain logic, prompts, and persistence helpers (see `backend/api` for the HTTP layer).
- `cli/` — helper CLI tooling for driving the local report generator and saving generated artifacts.
- `frontends/web/` — web front-end (see `frontends/web/README.md`).
- `frontends/ios/` — upcoming ios app.

---

## Environment configuration

Explorer relies on a handful of environment variables. Export them _in the shell that launches the API or CLI_ (or place them in a `.env` file and `source` it):

- `OPENAI_API_KEY` — required; key used for OpenAI API calls.
- `OPENAI_BASE_URL` — optional; point at a proxy or compatible gateway.
- `EXPLORER_DATABASE_URL` — optional; override the default `sqlite:///reportgen.db`.
- `EXPLORER_REPORT_STORAGE_DIR` — optional; persist artifacts somewhere other than `data/reports`.
- `EXPLORER_DEFAULT_OWNER_EMAIL` — optional; change the fallback owner for CLI runs.

You can also prefix inline commands:

```bash
OPENAI_API_KEY="sk-your-key" uvicorn backend.api.app:app --reload --port 8000
OPENAI_API_KEY="sk-your-key" python -m cli.stream_report --topic "Future of urban farming"
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

## Generate reports

`cli/stream_report.py` (run via `python -m cli.stream_report` or `python -m cli`) streams status updates to your terminal, saves finished artifacts under `cli/generated_reports/`, and can optionally persist the raw NDJSON stream. It talks to the FastAPI service you launched in the quickstart, but the HTTP layer is an internal implementation detail—you interact with Explorer through this CLI.

### Report from only a topic (auto-generated outline)

```bash
python -m cli.stream_report --topic "Supply chain resilience in 2025" --show-progress
```

- Streams progress and saves `cli/generated_reports/Supply chain resilience in 2025 report.md`.
- Save the streamed NDJSON (`--raw-stream run.ndjson`) or capture the CLI payload (`--payload-file`) whenever you want to reproduce a run later.

### Report with custom outline

```bash
python -m cli.stream_report --payload-file path/to/your_outline_payload.json --show-progress
```

- Reuses your outline and returns both the outline and finished report (`return="report_with_outline"` in the payload).

### Report with custom models

```bash
python -m cli.stream_report --payload-file path/to/your_models_payload.json --show-progress
```

- Edit the `models` block in the JSON file to target specific OpenAI models (outline → writer → translator → cleanup). Include `reasoning_effort` when using reasoning-capable models (names starting with `gpt-5`, `o3`, or `o4`).
- Fields you omit fall back to the backend defaults.

### Capture the raw NDJSON stream

```bash
python -m cli.stream_report --topic "Modern Data Governance for AI Teams" --show-progress --raw-stream run.ndjson
```

`httpx` is bundled with `pip install -r requirements.txt`, so reinstalling dependencies per the quickstart keeps the CLI working.

---

## Model notes

- Defaults to GPT-4o mini across outlining, section writing, and translation for consistent tone.
- Requests go through the OpenAI Responses API; reasoning controls are omitted because they are not supported by GPT-4o mini.
- Swap in reasoning-capable models as needed (include `reasoning_effort` in the payload and the server forwards it).

---

## License

MIT
