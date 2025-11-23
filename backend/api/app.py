import asyncio
import json
import os
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.db import (
    Base,
    Report,
    ReportStatus,
    SavedTopic,
    User,
    create_engine_from_url,
    create_session_factory,
    session_scope,
)
from backend.schemas import GenerateRequest, SuggestionsRequest, SuggestionsResponse
from backend.services.outline_service import OutlineService
from backend.services.report_service import ReportGeneratorService
from backend.services.suggestion_service import SuggestionService
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
def get_report_store() -> Optional[GeneratedReportStore]:
    if os.environ.get("EXPLORER_DISABLE_STORAGE", "").lower() in {"1", "true", "yes", "on"}:
        return None
    return GeneratedReportStore()


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    database_url = os.environ.get("EXPLORER_DATABASE_URL", "sqlite:///reportgen.db")
    engine = create_engine_from_url(database_url)
    Base.metadata.create_all(engine)
    return create_session_factory(engine)


@lru_cache
def get_suggestion_service() -> SuggestionService:
    return SuggestionService()


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


@app.post("/suggestions")
async def generate_suggestions(
    suggestions_request: SuggestionsRequest,
    suggestion_service: SuggestionService = Depends(get_suggestion_service),
) -> SuggestionsResponse:
    return await suggestion_service.generate(suggestions_request)


@app.get("/_routes")
def list_routes():
    return {"paths": [route.path for route in app.routes]}


class SavedTopicResponse(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    created_at: str


class CreateSavedTopicRequest(BaseModel):
    title: str


class ReportResponse(BaseModel):
    id: uuid.UUID
    topic: str
    title: Optional[str]
    status: ReportStatus
    summary: Optional[str]
    content: Optional[str] = None
    created_at: str
    updated_at: str


def _normalize_user(user_email: Optional[str], username: Optional[str]) -> tuple[str, Optional[str]]:
    email = (user_email or "").strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_email is required for this endpoint.",
        )
    normalized_username = (username or "").strip() or None
    return email, normalized_username


def _resolve_base_dir(report_store: Optional[GeneratedReportStore]) -> Path:
    if report_store:
        return report_store.base_dir
    configured = os.environ.get("EXPLORER_REPORT_STORAGE_DIR", "data/reports")
    return Path(configured).expanduser().resolve()


def _get_or_create_user(
    session: Session,
    user_email: str,
    username: Optional[str],
) -> User:
    user = session.scalar(select(User).where(User.email == user_email))
    if user:
        if username:
            if not user.full_name:
                user.full_name = username
            if not user.username:
                user.username = username
        return user
    user = User(email=user_email, full_name=username, username=username)
    session.add(user)
    session.flush()
    return user


def _slugify(value: str) -> str:
    slug = value.lower()
    cleaned = []
    for char in slug:
        if char.isalnum():
            cleaned.append(char)
        else:
            cleaned.append("-")
    slugified = "".join(cleaned).strip("-")
    return slugified or "topic"


def _resolve_topic_title(title: str) -> str:
    resolved = (title or "").strip()
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="title must contain non-whitespace characters.",
        )
    return resolved[:255]


def _load_report_content(report: Report, base_dir: Path) -> Optional[str]:
    if not report.content_uri:
        return None
    path = Path(report.content_uri)
    if not path.is_absolute():
        path = base_dir / path
    try:
        if path.exists():
            return path.read_text(encoding="utf-8")
    except Exception:
        return None
    return None


@app.get("/saved_topics", response_model=list[SavedTopicResponse])
def list_saved_topics(
    user_email: EmailStr = Query(..., description="Email used to scope results to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = _normalize_user(user_email, username)
    with session_scope(session_factory) as session:
        user = _get_or_create_user(session, user_email, username)
        topics = session.scalars(
            select(SavedTopic)
            .where(
                SavedTopic.owner_user_id == user.id,
                SavedTopic.is_deleted.is_(False),
            )
            .order_by(SavedTopic.created_at.desc())
        ).all()
        return [
            SavedTopicResponse(
                id=topic.id,
                title=topic.title,
                slug=topic.slug,
                created_at=topic.created_at.isoformat(),
            )
            for topic in topics
        ]


@app.post("/saved_topics", response_model=SavedTopicResponse, status_code=status.HTTP_201_CREATED)
def create_saved_topic(
    payload: CreateSavedTopicRequest,
    user_email: EmailStr = Query(..., description="Email used to scope the new topic to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = _normalize_user(user_email, username)
    title = _resolve_topic_title(payload.title)
    with session_scope(session_factory) as session:
        user = _get_or_create_user(session, user_email, username)
        existing = session.scalar(
            select(SavedTopic).where(
                SavedTopic.owner_user_id == user.id,
                SavedTopic.title == title,
            )
        )
        if existing:
            if existing.is_deleted:
                existing.is_deleted = False
            return SavedTopicResponse(
                id=existing.id,
                title=existing.title,
                slug=existing.slug,
                created_at=existing.created_at.isoformat(),
            )

        base_slug = _slugify(title)
        slug = base_slug
        attempt = 0
        while True:
            conflict = session.scalar(select(SavedTopic).where(SavedTopic.slug == slug))
            if conflict is None:
                break
            if conflict.owner_user_id == user.id and conflict.title == title:
                existing_topic = conflict
                if existing_topic.is_deleted:
                    existing_topic.is_deleted = False
                return SavedTopicResponse(
                    id=existing_topic.id,
                    title=existing_topic.title,
                    slug=existing_topic.slug,
                    created_at=existing_topic.created_at.isoformat(),
                )
            attempt += 1
            slug = f"{base_slug}-{attempt}"

        topic = SavedTopic(
            slug=slug,
            title=title,
            owner=user,
        )
        session.add(topic)
        session.flush()
        return SavedTopicResponse(
            id=topic.id,
            title=topic.title,
            slug=topic.slug,
            created_at=topic.created_at.isoformat(),
        )


@app.delete("/saved_topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_topic(
    topic_id: uuid.UUID,
    user_email: EmailStr = Query(..., description="Email used to scope the delete to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = _normalize_user(user_email, username)
    with session_scope(session_factory) as session:
        user = _get_or_create_user(session, user_email, username)
        topic = session.get(SavedTopic, topic_id)
        if not topic or topic.owner_user_id != user.id or topic.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved topic not found.")
        topic.is_deleted = True
        reports = session.scalars(
            select(Report).where(
                Report.saved_topic_id == topic.id,
                Report.owner_user_id == user.id,
                Report.is_deleted.is_(False),
            )
        ).all()
        for report in reports:
            report.is_deleted = True


@app.get("/reports", response_model=list[ReportResponse])
def list_reports(
    user_email: EmailStr = Query(..., description="Email used to scope results to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    include_content: bool = Query(False, description="When true, includes report content from storage."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
    report_store: Optional[GeneratedReportStore] = Depends(get_report_store),
):
    user_email, username = _normalize_user(user_email, username)
    base_dir = _resolve_base_dir(report_store)
    with session_scope(session_factory) as session:
        user = _get_or_create_user(session, user_email, username)
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
                content=_load_report_content(report, base_dir) if include_content else None,
                created_at=report.created_at.isoformat(),
                updated_at=report.updated_at.isoformat(),
            )
            for report in reports
        ]


@app.get("/reports/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: uuid.UUID,
    user_email: EmailStr = Query(..., description="Email used to scope the request to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
    report_store: Optional[GeneratedReportStore] = Depends(get_report_store),
):
    user_email, username = _normalize_user(user_email, username)
    base_dir = _resolve_base_dir(report_store)
    with session_scope(session_factory) as session:
        user = _get_or_create_user(session, user_email, username)
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
            content=_load_report_content(report, base_dir),
            created_at=report.created_at.isoformat(),
            updated_at=report.updated_at.isoformat(),
        )


@app.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: uuid.UUID,
    user_email: EmailStr = Query(..., description="Email used to scope the delete to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = _normalize_user(user_email, username)
    with session_scope(session_factory) as session:
        user = _get_or_create_user(session, user_email, username)
        report = session.get(Report, report_id)
        if not report or report.owner_user_id != user.id or report.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
        report.is_deleted = True
