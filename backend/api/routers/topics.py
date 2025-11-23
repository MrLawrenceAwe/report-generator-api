from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.api.dependencies import get_session_factory
from backend.db import SavedTopic, Report, session_scope
from backend.schemas import SavedTopicResponse, CreateSavedTopicRequest
from backend.utils.api_helpers import (
    normalize_user,
    get_or_create_user,
    resolve_topic_title,
    slugify,
)

router = APIRouter()

@router.get("/saved_topics", response_model=List[SavedTopicResponse])
def list_saved_topics(
    user_email: EmailStr = Query(..., description="Email used to scope results to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = normalize_user(user_email, username)
    with session_scope(session_factory) as session:
        user = get_or_create_user(session, user_email, username)
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


@router.post("/saved_topics", response_model=SavedTopicResponse, status_code=status.HTTP_201_CREATED)
def create_saved_topic(
    payload: CreateSavedTopicRequest,
    user_email: EmailStr = Query(..., description="Email used to scope the new topic to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = normalize_user(user_email, username)
    title = resolve_topic_title(payload.title)
    with session_scope(session_factory) as session:
        user = get_or_create_user(session, user_email, username)
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

        base_slug = slugify(title)
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


@router.delete("/saved_topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_topic(
    topic_id: uuid.UUID,
    user_email: EmailStr = Query(..., description="Email used to scope the delete to the current user."),
    username: Optional[str] = Query(None, description="Optional username stored when creating the user record."),
    session_factory: sessionmaker[Session] = Depends(get_session_factory),
):
    user_email, username = normalize_user(user_email, username)
    with session_scope(session_factory) as session:
        user = get_or_create_user(session, user_email, username)
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
