import json
from functools import lru_cache
from typing import Literal, Optional

from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from report_generator.models import GenerateRequest, OutlineRequest, ReasoningEffort
from report_generator.outline_service import OutlineParsingError, OutlineService
from report_generator.report_service import ReportGeneratorService

app = FastAPI(title="Report Generator API", version="2.0.0")


@lru_cache
def get_outline_service() -> OutlineService:
    return OutlineService()


@lru_cache
def get_report_service() -> ReportGeneratorService:
    return ReportGeneratorService(outline_service=get_outline_service())


@app.api_route("/generate_outline", methods=["GET", "POST"])
async def generate_outline_endpoint(
    outline_request: Optional[OutlineRequest] = Body(default=None),
    topic: Optional[str] = Query(None, description="Topic to outline"),
    outline_format: Literal["json", "markdown"] = Query("json", alias="format"),
    model: Optional[str] = Query(None, description="Model name override"),
    reasoning_effort: Optional[ReasoningEffort] = Query(None, description="Reasoning effort when supported"),
    outline_service: OutlineService = Depends(get_outline_service),
):
    if outline_request is None:
        if not topic:
            raise HTTPException(status_code=400, detail="Provide a topic via query when no JSON body is supplied.")
        outline_request = outline_service.build_outline_request(
            topic,
            outline_format,
            model,
            reasoning_effort,
        )
    try:
        return await outline_service.handle_outline_request(outline_request)
    except OutlineParsingError as exception:
        raise HTTPException(
            status_code=502,
            detail={
                "error": f"Failed to parse outline JSON: {exception}",
                "raw_response": exception.raw_response,
            },
        ) from exception


@app.post("/generate_report")
def generate_report(
    generate_request: GenerateRequest,
    report_service: ReportGeneratorService = Depends(get_report_service),
):
    async def event_stream():
        try:
            async for event in report_service.stream_report(generate_request):
                yield json.dumps(event) + "\n"
        except Exception as exception:  # pragma: no cover - defensive
            yield json.dumps({"status": "error", "detail": str(exception)}) + "\n"

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
    return {"paths": [route.path for route in app.routes]}
