"""FastAPI entry point.

Wires up middleware (CORS, rate limiting), creates DB tables on startup
(when not using Alembic — handy for SQLite local dev), and mounts API
routers under /api.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app import __version__
from app.api.routes import feedback as feedback_routes
from app.api.routes import generate as generate_routes
from app.api.routes import history as history_routes
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.schemas import HealthResponse
from app.db.session import Base, engine

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    description="Architecture Diagram → Terraform Code Generator API",
    version=__version__,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup_create_tables() -> None:
    """Create tables for local/sqlite dev. In production prefer Alembic.

    This is safe to call repeatedly: SQLAlchemy will only create missing
    tables and is a no-op when they already exist.
    """
    try:
        from app.db import models  # noqa: F401  (register models with Base)

        Base.metadata.create_all(bind=engine)
        logger.info("Database tables ensured.")
    except Exception:
        logger.exception("Failed to create database tables on startup")


@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app=settings.APP_NAME,
        version=__version__,
        env=settings.APP_ENV,
    )


app.include_router(generate_routes.router, prefix="/api", tags=["generate"])
app.include_router(history_routes.router, prefix="/api", tags=["history"])
app.include_router(feedback_routes.router, prefix="/api", tags=["feedback"])


@app.get("/", tags=["meta"])
def root() -> dict:
    return {
        "name": settings.APP_NAME,
        "version": __version__,
        "docs": "/docs",
        "health": "/api/health",
    }
