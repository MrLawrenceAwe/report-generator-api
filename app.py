import json
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from report_generator.models import GenerateRequest, OutlineRequest, ReasoningEffort
from report_generator.report_service import OutlineParsingError, OutlineService, ReportGenerationService

app = FastAPI(title="Report Generator API", version="2.0.0")

_outline_service = OutlineService()
_report_service = ReportGenerationService()


def _build_outline_request(
    topic: str,
    fmt: str,
    model_name: Optional[str],
    reasoning_effort: Optional[ReasoningEffort],
) -> OutlineRequest:
    return _outline_service.build_outline_request(topic, fmt, model_name, reasoning_effort)


def _handle_outline_request(req: OutlineRequest):
    try:
        return _outline_service.handle_outline_request(req)
    except OutlineParsingError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": f"Failed to parse outline JSON: {exc}",
                "raw_response": exc.raw_response,
            },
        ) from exc


@app.get("/generate_outline")
def generate_outline(
    topic: str = Query(..., description="Topic to outline"),
    fmt: str = Query("json", alias="format"),
    model: Optional[str] = Query(None, description="Model name override"),
    reasoning_effort: Optional[ReasoningEffort] = Query(None, description="Reasoning effort when supported"),
):
    req = _build_outline_request(topic, fmt, model, reasoning_effort)
    return _handle_outline_request(req)


@app.post("/generate_outline")
def generate_outline_post(
    req: Optional[OutlineRequest] = Body(default=None),
    topic: Optional[str] = Query(None, description="Topic to outline"),
    fmt: str = Query("json", alias="format"),
    model: Optional[str] = Query(None, description="Model name override"),
    reasoning_effort: Optional[ReasoningEffort] = Query(None, description="Reasoning effort when supported"),
):
    if req is None:
        if not topic:
            raise HTTPException(status_code=400, detail="Provide a topic via query when no JSON body is supplied.")
        req = _build_outline_request(topic, fmt, model, reasoning_effort)
    return _handle_outline_request(req)


@app.post("/generate_report")
def generate_report(req: GenerateRequest):
    if req.outline is None and (not req.topic or req.mode != "generate_report"):
        raise HTTPException(status_code=400, detail="When only a topic is provided, include \"mode\":\"generate_report\".")

    async def event_stream():
        try:
            async for event in _report_service.stream_report(req):
                yield json.dumps(event) + "\n"
        except Exception as exc:  # pragma: no cover - defensive
            yield json.dumps({"status": "error", "detail": str(exc)}) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/_routes")
def list_routes():
    return {"paths": [r.path for r in app.routes]}
