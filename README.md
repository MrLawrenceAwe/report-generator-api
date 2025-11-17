# Explorer

Turn any topic into a structured outline or a polished, audio-friendly report in minutes.

---

## Project layout

- `backend/` — FastAPI APIs plus report generation domain logic, prompts, and persistence helpers (see `backend/api` for the HTTP layer).
- `clients/cli/` — helper CLI tooling for driving the local report generator and saving generated artifacts.
- `clients/frontend/` — placeholder for the future browser-based surface (see `clients/frontend/README.md`).

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
OPENAI_API_KEY="sk-your-key" python clients/cli/stream_report.py --topic "Future of urban farming"
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

## Generate outlines and reports

`clients/cli/stream_report.py` streams status updates to your terminal, saves finished artifacts under `clients/cli/generated_reports/`, and can optionally persist the raw NDJSON stream. It talks to the FastAPI service you launched in the quickstart, but the HTTP layer is an internal implementation detail—you interact with Explorer through this CLI.

Use `--owner-email you@example.com --owner-name "Your Name"` to associate the generated report with a persisted Explorer user record. Add `--sections 4` (or any positive integer) when you want to force the generated outline to contain exactly four main sections. Subject filters are also supported: repeat `--subject-inclusion "robotics"` and/or `--subject-exclusion "celebrity gossip"` to steer content without editing JSON payloads manually.

### Outline from a topic

```bash
python clients/cli/stream_report.py --outline --topic "Supply chain resilience in 2025"
```

- Produces `clients/cli/generated_reports/Supply chain resilience in 2025 outline.md` (add `--format json` to switch to JSON).
- Save the request payload to a JSON file and pass it back with `--payload-file` to rerun the same call.

### Report from only a topic (auto-generated outline)

```bash
python clients/cli/stream_report.py --topic "Supply chain resilience in 2025" --show-progress
```

- Streams progress and saves `clients/cli/generated_reports/Supply chain resilience in 2025 report.md`.
- Save the streamed NDJSON (`--raw-stream run.ndjson`) or capture the CLI payload (`--payload-file`) whenever you want to reproduce a run later.

### Report with your outline

```bash
python clients/cli/stream_report.py --payload-file path/to/your_outline_payload.json --show-progress
```

- Reuses your outline and returns both the outline and finished report (`return="report_with_outline"` in the payload).

### Report with custom models

```bash
python clients/cli/stream_report.py --payload-file path/to/your_models_payload.json --show-progress
```

- Edit the `models` block in the JSON file to target specific OpenAI models (outline → writer → translator → cleanup). Include `reasoning_effort` when using reasoning-capable models (names starting with `gpt-5`, `o3`, or `o4`).
- Fields you omit fall back to the backend defaults.

### Capture the raw NDJSON stream

```bash
python clients/cli/stream_report.py --topic "Modern Data Governance for AI Teams" --show-progress --raw-stream run.ndjson
```

`httpx` is bundled with `pip install -r requirements.txt`, so reinstalling dependencies per the quickstart keeps the CLI working.

---

## Storage and cleanup

Finished runs are persisted automatically via `backend.storage.GeneratedReportStore`. Each user/report pair creates `outline.json` and `report.md` files under `data/reports/<owner_id>/<report_id>/` plus a row in `reportgen.db`. Failed generations clean themselves up.

Use `scripts/clean_reports.py` to wipe on-disk artifacts and (optionally) truncate the `reports` table between test runs.

---

## Model notes

- Defaults to GPT-4o mini across outlining, section writing, and translation for consistent tone.
- Requests go through the OpenAI Responses API; reasoning controls are omitted because they are not supported by GPT-4o mini.
- Swap in reasoning-capable models as needed (include `reasoning_effort` in the payload and the server forwards it).

---

## License

MIT
