# Report Generation Workflow Guide

Frontends interact with Explorer through the HTTP endpoints hosted by `backend/api/app.py`. This guide summarizes the contracts those endpoints expose, every NDJSON event emitted while streaming a report, and how per-stage model configuration works so new clients can integrate without reverse-engineering the Python services.

## API Surface

### `POST /generate_report`

Streams an `application/x-ndjson` response where each line is a JSON object shaped like one of the events documented under “Stream events”. Requests are the serialized `backend.models.GenerateRequest` payload (see `cli/stream_report.py::load_payload` for an end-to-end example).

Required fields when no outline is supplied:

- `topic` — non-empty string (`GenerateRequest` enforces trimming + validation).
- `mode` — must equal `"generate_report"`.

Optional fields:

- `outline` — full outline payload (skips outlining when present).
- `sections` — exact number of sections to request for both outlining and writing.
- `subject_inclusions`, `subject_exclusions` — sanitized via `normalize_subject_list`.
- `owner_email`, `owner_username` — owner metadata; supply both together (username is required whenever an email is provided).
- `models` — per-stage overrides (see “Model configuration”).
- `writer_fallback` — model name to fall back to if the primary writer errors.
- `return` — either `"report"` (default) or `"report_with_outline"` to receive the outline in the final payload as `outline_used`.

Standalone outlines are no longer exposed as a client-facing API. Always call `/generate_report`; the backend handles outlining internally and only surfaces the outline snapshot when a report payload opts into `return="report_with_outline"`.

Cancellation propagates directly: clients should treat HTTP disconnects as aborts, and retries must resend the full payload because the backend rolls back the partially written report (see `GeneratedReportStore.discard_report`).

## Stream Events

`backend.report_service._ReportStreamRunner` emits events in the order documented below. Every event includes at least a `status` field. Clients should handle unknown statuses gracefully for forward compatibility.

| Status | Context |
| --- | --- |
| `started` | Run was accepted and is initializing. |
| `generating_outline` | The outline step is calling the configured model; payload includes `model` and optional `reasoning_effort`. |
| `outline_ready` | Outline JSON was parsed; includes `model`, `sections`, and reasoning info. |
| `using_provided_outline` | Skips outlining when the payload already contains an outline; includes `sections`. |
| `begin_sections` | Writing phase starts; includes outline metadata, model names, fallback model (when set), and reasoning-effort fields for writer/translator/cleanup specs. |
| `writing_section` | Emitted per section with `section` title before writer prompts run. |
| `writer_model_fallback` | Writer failure triggered the fallback model; includes section title, previous + fallback model names, and the underlying error string. |
| `translating_section` | Translator model is narrating the raw section. |
| `cleaning_section` | Cleanup model is stripping meta commentary (only when `cleanup` differs from `translator`). |
| `section_complete` | Section narration finished; includes the section title. |
| `error` | Fatal errors stop the run; payload supplies `detail` plus (when applicable) `section`. The backend also discards stored artifacts. |
| `complete` | Success. Payload contains `report_title`, concatenated `report` narration, and optionally `outline_used` when `return="report_with_outline"`. |

Many events (all except `complete` and the error case) are followed by a zero-length `await asyncio.sleep(0)` yield so UI loops can stay responsive.

## Model Configuration

`GenerateRequest.models` is a mapping keyed by stage name. Supported keys align with `_ReportStreamRunner.__post_init__`:

- `outline` — Outline generation model (`DEFAULT_TEXT_MODEL` fallback).
- `writer` — Section prose model.
- `translator` — Narration model, defaults to the writer when unspecified.
- `cleanup` — Optional cleanup model. When omitted the translator handles cleanup inline, and `cleanup_required` becomes `False`.

Each value is a `ModelSpec`:

```json
{
  "model": "gpt-4o-mini",
  "reasoning_effort": "medium"
}
```

`reasoning_effort` only applies to models whose names start with `gpt-5`, `o3`, or `o4`. Invalid combinations fail validation before the request enters the pipeline.

When the writer fails, `_maybe_activate_writer_fallback` swaps in `writer_fallback` (if provided) and emits the `writer_model_fallback` status. Clients should surface this to users because the fallback can change tone, latency, or cost.

## Persistence & Metadata

`backend.storage.GeneratedReportStore` performs the following automatically:

1. Creates/updates the owning `User` row (defaulting to `EXPLORER_DEFAULT_OWNER_EMAIL` and a fallback username when the payload omits them).
2. Creates or reuses a `SavedTopic` for the owner. Slugs stay unique per account, and naming collisions retry with suffixed variants.
3. Persists each run as a `Report` row, storing snapshot JSON of the outline and the streaming progress.
4. Writes artifacts to `<storage-base>/<owner_id>/<report_id>/outline.json` and `report.md`, returning handles with those paths.

Failures at any stage trigger `discard_report`, which deletes artifacts and DB rows. Frontends therefore do not need a manual cleanup flow for aborted runs.

## Resetting local state after manual testing

`python scripts/reset_explorer_state.py` now wipes everything that the backend and CLI create: it removes the artifacts directory you point at (`data/reports` by default) and, unless you pass `--keep-db`, deletes `reportgen.db` together with its WAL/SHM companions so the database tables start empty. Removing the DB also reverts `SavedTopic`/`User` rows, so running the script without `--keep-db` feels like the very first install. Supply `--db-path` or `--data-dir` to target alternate locations if you have configured `EXPLORER_DATABASE_URL`/`EXPLORER_REPORT_STORAGE_DIR`.

If a quicker cleanup is enough, `--keep-db` preserves the existing SQLite file and simply clears the `reports` table (identical to the old `clean_reports.py` behavior) before vacuuming.

To reset the UI’s remembered topics/reports along with the backend state, clear the `explorer-saved-topics` and `explorer-saved-reports` keys from your browser’s `localStorage` (Application → Local Storage → [origin] in DevTools or run `localStorage.removeItem("explorer-saved-topics"); localStorage.removeItem("explorer-saved-reports");` in the console). That combination leaves the system in the same state as a fresh install.

## Integration Checklist

1. **Build a typed client.** Mirror `cli/stream_report.py` logic for payload validation, subject-filter cleanup, and owner metadata handling.
2. **Handle every stream status.** Map `status` values to UI elements (spinners, per-section progress, fallback alerts, error banners).
3. **Expose model overrides.** Let power users pick per-stage models and reasoning levels; enforce the backend’s rules before sending the payload so validation errors can appear inline.
4. **Persist owner data.** Collect both `owner_email` and `owner_username` when the UI creates a run so artifacts link to real users instead of the system default.
5. **Plan for retries/cancellation.** Surface backend errors, and ensure reruns send identical payloads when the user wants to resume a failed topic.
