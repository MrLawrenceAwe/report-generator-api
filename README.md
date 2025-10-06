# Report Generation API

## What you get
- **Endpoints**
  - `POST /outline` — Case A (Topic only) → returns an outline (JSON by default).
  - `POST /generate_report` — Case A with `mode=generate_report` *or* Case B (Topic + subsections) → returns the final, audio‑friendly report.
- **Model controls**
  - Outline uses **GPT-4o mini** by default.
  - **Section writing** uses **GPT-4o mini** by default.
  - Translator also uses **GPT-4o mini** by default for consistency.
  - You can switch individual stages to other models via payload overrides when needed.
  - Final report is plain text with numbered headings (e.g., `1:` sections and `1.1:` subsections).
- **Packaging**
  - Ready‑to‑run FastAPI server.
  - Minimal, clean code with strong typing (pydantic).

> ⚠️ You’ll need an **OpenAI API key** in your environment: `export OPENAI_API_KEY=...`

---

## Quickstart

```bash
# 1) (optional) use a virtualenv
python3 -m venv .venv && source .venv/bin/activate

# 2) Install deps
pip install -r requirements.txt

# 3) Run the API (reload for local dev)
uvicorn app:app --reload --port 8000
```

Open http://localhost:8000/docs for interactive Swagger.

### Example: Case A (return outline)

```bash
python scripts/stream_report.py --outline --topic "Supply chain resilience in 2025"
```

This saves `Supply chain resilience in 2025 outline.md` by default. Prefer JSON? Add `--format json` to switch the download to `... outline.json`.

> Prefer raw HTTP? `curl "http://localhost:8000/outline?topic=..."` still works.

### Example: Case A (generate report)

```bash
python scripts/stream_report.py --topic "Supply chain resilience in 2025" --show-progress
```

By default this writes `Supply chain resilience in 2025 report.md`; override with `--outfile` when needed.

### Example: Case B (topic + subsections)

```bash
python scripts/stream_report.py --payload-file example_requests/caseB_generate_report.json --show-progress
```

### Helper script: capture the final report cleanly

If you would rather not sift through the streamed NDJSON manually, run the helper script after starting the API:

```bash
pip install httpx  # once per environment
python scripts/stream_report.py --topic "Modern Data Governance for AI Teams" --show-progress --raw-stream run.ndjson
```

The script prints progress (optional), stores the raw stream when requested, and writes the final report to `Modern Data Governance for AI Teams report.md` by default.

---

## Payloads

### `/outline` (Case A)

```jsonc
{
  "topic": "Supply chain resilience in 2025",
  "format": "json",                 // "json" (default) or "markdown"
  "model": {
    "model": "gpt-4o-mini"         // default
  }
}
```

**Response (JSON outline):**

```json
{
  "report_title": "Supply Chain Resilience in 2025",
  "sections": [
    {"title": "Section 1: ...", "subsections": ["1.1 ...", "1.2 ..."]}
  ]
}
```

> If `format="markdown"`, you'll get a Markdown outline instead.

### `/generate_report` (Case A with mode=generate_report, or Case B)

```jsonc
{
  "topic": "Supply chain resilience in 2025",     // required for Case A
  "mode": "generate_report",                      // required for Case A
  "outline": {                                    // optional override; if omitted, we auto-outline
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

**Response:**

```json
{
  "report_title": "Supply Chain Resilience in 2025",
  "report": "Full audio-friendly narration...",
  "outline_used": {...} // only when return=report_with_outline
}
```

> The "report" field is returned as plain text headed by the title line, then numbered sections (`1:`) and subsections (`1.1:`).

---

## How it maps to your spec

- **Case A (Topic only)**
  1) Outline generation → uses GPT-4o mini.  
  2) If `mode=return_outline`: returns outline.  
  3) If `mode=generate_report`: runs **Report Generation Flow**.

- **Case B (Topic + subsections)**  
  - Skip outline, run **Report Generation Flow**.

- **Report Generation Flow**
  - Step 1 — **Section Writing** (per section): uses the writer model and includes all section headers + the report‑so‑far for continuity.  
  - Step 2 — **Section Translation** (per section): translates the written section into audio‑friendly narration.  
  - Step 3 — **Assembly**: concatenates translated subsections into final narration.

---

## Environment variables

- `OPENAI_API_KEY` — required.
- `OPENAI_BASE_URL` — optional (for proxies / gateways).

---

## Notes on GPT-4o mini usage

- We use the **Responses API** with GPT-4o mini defaults; the payload omits reasoning controls because they are not supported.
- If you swap in a reasoning-capable model, include `reasoning_effort` in the payload (the server will forward it when applicable).

---

## License

MIT
