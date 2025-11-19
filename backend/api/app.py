import asyncio
import json
from functools import lru_cache
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.schemas import GenerateRequest
from backend.services.outline_service import OutlineService
from backend.services.report_service import ReportGeneratorService
from backend.storage import GeneratedReportStore

app = FastAPI(title="Explorer", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def get_outline_service() -> OutlineService:
    return OutlineService()


@lru_cache
def get_report_service() -> ReportGeneratorService:
    return ReportGeneratorService(
        outline_service=get_outline_service(),
        report_store=get_report_store(),
    )


@lru_cache
def get_report_store() -> GeneratedReportStore:
    return GeneratedReportStore()


@app.post("/generate_report")
def generate_report(
    generate_request: GenerateRequest,
    report_service: ReportGeneratorService = Depends(get_report_service),
):
    async def event_stream():
        try:
            async for event in report_service.stream_report(generate_request):
                yield json.dumps(event) + "\n"
        except asyncio.CancelledError:
            raise
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
