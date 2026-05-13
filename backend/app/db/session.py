"""Database engine, session factory, and base model.

Provides both sync (Session) and async (AsyncSession) paths:
- Sync: used by v1 routes, auth, history, feedback (established pattern)
- Async: used by v2 routes and any new async route handlers (§1 P2 fix)

SQLite: sync only (aiosqlite optional; async path auto-detects).
Postgres: full async via asyncpg.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# ── Sync engine (SQLite + Postgres, all existing routes) ───────────────────

connect_args: dict = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args=connect_args,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a sync SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Async engine (Postgres via asyncpg; SQLite via aiosqlite) ──────────────

def _make_async_url(url: str) -> str:
    """Convert sync DB URL to async driver URL."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    return url


try:
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    _async_url = _make_async_url(settings.DATABASE_URL)
    _async_connect_args: dict = {}
    if "sqlite" in _async_url:
        _async_connect_args["check_same_thread"] = False

    async_engine = create_async_engine(
        _async_url,
        pool_pre_ping=True,
        connect_args=_async_connect_args,
        future=True,
    )

    AsyncSessionLocal = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )

    async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
        """FastAPI dependency that yields an async SQLAlchemy session."""
        async with AsyncSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    _ASYNC_AVAILABLE = True

except ImportError:
    # asyncpg / aiosqlite not installed — async session unavailable
    _ASYNC_AVAILABLE = False
    AsyncSession = None  # type: ignore[misc,assignment]
    AsyncSessionLocal = None  # type: ignore[assignment]

    async def get_async_db():  # type: ignore[misc]
        """Fallback: yield sync session wrapped for async routes."""
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
