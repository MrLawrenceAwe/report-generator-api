from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def create_engine_from_url(
    database_url: str,
    *,
    echo: bool = False,
    pool_pre_ping: bool = True,
) -> Engine:
    """Create a SQLAlchemy engine configured for modern 2.0 usage."""

    return create_engine(
        database_url,
        echo=echo,
        pool_pre_ping=pool_pre_ping,
        future=True,
    )


def create_session_factory(
    engine: Engine,
    *,
    expire_on_commit: bool = False,
) -> sessionmaker[Session]:
    """Return a session factory bound to ``engine``."""

    return sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=expire_on_commit,
        future=True,
    )


@contextmanager
def session_scope(
    session_factory: sessionmaker[Session],
) -> Generator[Session, None, None]:
    """Provide a transactional scope around a series of operations."""

    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
