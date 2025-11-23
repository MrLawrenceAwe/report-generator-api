import asyncio
import json
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.api.dependencies import (
    get_session_factory,
    get_report_store,
    get_report_service,
)
from backend.db import Report, session_scope
from backend.schemas import ReportResponse, GenerateRequest
from backend.services.report_service import ReportGeneratorService
from backend.storage import GeneratedReportStore
from backend.utils.api_helpers import (
    normalize_user,
    get_or_create_user,
    resolve_base_dir,
    load_report_content,
)

router = APIRouter()

@router.post("/generate_report")
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


@router.get("/reports", response_model=List[ReportResponse])
def list_reports(
    user_email: EmailStr = Query(..., description="Email used to scope results to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    include_content: bool = Query(False, description="When true, includes report content from storage."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
    report_store: Optional[GeneratedReportStore] = Depends(get_report_store),
):
    user_email, username = normalize_user(user_email, username)
    base_dir = resolve_base_dir(report_store)
    with session_scope(session_factory) as session:
        user = get_or_create_user(session, user_email, username)
        reports = session.scalars(
            select(Report)
            .where(
                Report.owner_user_id == user.id,
                Report.is_deleted.is_(False),
            )
            .order_by(Report.created_at.desc())
        ).all()
        return [
            ReportResponse(
                id=report.id,
                topic=report.saved_topic.title if report.saved_topic else "",
                title=(
                    (report.outline_snapshot or {}).get("report_title")
                    if report.outline_snapshot
                    else report.saved_topic.title if report.saved_topic else None
                ),
                status=report.status,
                summary=report.summary,
                content=load_report_content(report, base_dir) if include_content else None,
                created_at=report.created_at.isoformat(),
                updated_at=report.updated_at.isoformat(),
            )
            for report in reports
        ]


@router.get("/reports/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: uuid.UUID,
    user_email: EmailStr = Query(..., description="Email used to scope the request to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
    report_store: Optional[GeneratedReportStore] = Depends(get_report_store),
):
    user_email, username = normalize_user(user_email, username)
    base_dir = resolve_base_dir(report_store)
    with session_scope(session_factory) as session:
        user = get_or_create_user(session, user_email, username)
        report = session.get(Report, report_id)
        if not report or report.owner_user_id != user.id or report.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
        return ReportResponse(
            id=report.id,
            topic=report.saved_topic.title if report.saved_topic else "",
            title=(
                (report.outline_snapshot or {}).get("report_title")
                if report.outline_snapshot
                else report.saved_topic.title if report.saved_topic else None
            ),
            status=report.status,
            summary=report.summary,
            content=load_report_content(report, base_dir),
            created_at=report.created_at.isoformat(),
            updated_at=report.updated_at.isoformat(),
        )


@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: uuid.UUID,
    user_email: EmailStr = Query(..., description="Email used to scope the delete to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = normalize_user(user_email, username)
    with session_scope(session_factory) as session:
        user = get_or_create_user(session, user_email, username)
        report = session.get(Report, report_id)
        if not report or report.owner_user_id != user.id or report.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
        report.is_deleted = True
