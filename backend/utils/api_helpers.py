from typing import Optional, Tuple
import os
from pathlib import Path
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import User, Report
from backend.storage import GeneratedReportStore

def normalize_user(user_email: Optional[str], username: Optional[str]) -> Tuple[str, Optional[str]]:
    email = (user_email or "").strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_email is required for this endpoint.",
        )
    normalized_username = (username or "").strip() or None
    return email, normalized_username

def resolve_base_dir(report_store: Optional[GeneratedReportStore]) -> Path:
    if report_store:
        return report_store.base_dir
    configured = os.environ.get("EXPLORER_REPORT_STORAGE_DIR", "data/reports")
    return Path(configured).expanduser().resolve()

def get_or_create_user(
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

def slugify(value: str) -> str:
    slug = value.lower()
    cleaned = []
    for char in slug:
        if char.isalnum():
            cleaned.append(char)
        else:
            cleaned.append("-")
    slugified = "".join(cleaned).strip("-")
    return slugified or "topic"

def resolve_topic_title(title: str) -> str:
    resolved = (title or "").strip()
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="title must contain non-whitespace characters.",
        )
    return resolved[:255]

def load_report_content(report: Report, base_dir: Path) -> Optional[str]:
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
