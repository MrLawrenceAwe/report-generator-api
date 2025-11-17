# Explorer front end

A minimalist React surface that mirrors ChatGPT's single text bar and streaming conversation pane. Use it to call Explorer's `/generate_report` endpoint without the CLI.

## Running locally

1. Start the FastAPI service:
   ```bash
   uvicorn backend.api.app:app --reload --port 8000
   ```
2. Serve the static files (any web server works). For example:
   ```bash
   python -m http.server 4173 --directory clients/frontend
   ```
3. Visit `http://localhost:4173`. By default the client targets the same origin it was served from. If your Explorer API runs on a different host/port, append `?apiBase=http://localhost:8000` (or your URL) to override the target. The override is cached in `localStorage` so you only need to set it once.

### Features
- Pane layout with a left rail for saved topics and generated report history alongside the chat canvas.
- Mode toggle to switch between generating long-form topic reports (Topic) and structured outlines that seed report generation (Outline).
- Streaming NDJSON reader for `/generate_report` so topic and outline submissions stream directly in the UI.
- Single, stretch-to-fit composer bar with a Stop action while a topic report is streaming.
- Outline mode builds the outline in-line (either manually or from JSON) and submits it as the structure for report generation.
- Subtle monochrome styling (Space Grotesk + Inter) that keeps the single text bar and outline builder front and center.
