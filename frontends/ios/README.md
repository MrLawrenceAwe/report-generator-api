# Explorer iOS Frontend

Placeholder for the native SwiftUI client that will eventually ship alongside the web UI and CLI. Until the app scaffolding exists, the shared integration contract lives in `docs/report_workflow.md` and the CLI (`cli/stream_report.py`) is the canonical reference implementation.

Next steps once the app work begins:

1. Initialize an Xcode project under this directory (e.g., `ExplorerMobile.xcodeproj`).
2. Build a lightweight networking layer that mirrors the CLI payload builders and NDJSON reader.
3. Share any cross-platform code via reusable Python packages or an HTTP/GraphQL surface—avoid reaching into backend internals directly.
