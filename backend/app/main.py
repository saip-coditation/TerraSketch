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
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware

from app import __version__
from app.admin_ui import mount_admin
from app.api.routes import auth as auth_routes
from app.api.routes import feedback as feedback_routes
from app.api.routes import generate as generate_routes
from app.api.routes import history as history_routes
from app.api.routes import v2_generate as v2_generate_routes
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.schemas import HealthResponse
from app.db.session import Base, engine
from app.middleware.request_id import RequestIdMiddleware

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

app.add_middleware(RequestIdMiddleware)

_admin_pw = (settings.ADMIN_UI_PASSWORD or "").strip()
if _admin_pw:
    _sess = (
        settings.ADMIN_SESSION_SECRET or settings.JWT_SECRET or "change-me-admin-session"
    ).strip()
    app.add_middleware(
        SessionMiddleware,
        secret_key=_sess,
        session_cookie="terrasketch_admin",
        max_age=14 * 24 * 3600,
        same_site="lax",
    )
    mount_admin(app)
else:
    logger.warning(
        "Admin UI is off: set ADMIN_UI_PASSWORD in backend/.env, then restart Uvicorn. "
        "Then open http://127.0.0.1:8000/admin"
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


# Private LAN regex for same-Wi‑Fi phone testing (optional; off in production if you set CORS_ALLOW_PRIVATE_NETWORK=false)
_private_lan_origin_regex = (
    r"^https?://("
    r"localhost|127\.0\.0\.1"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r"):\d+$"
)

_cors_kwargs = dict(
    allow_origins=settings.allowed_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if settings.APP_ENV.lower() == "development" and settings.CORS_ALLOW_PRIVATE_NETWORK:
    _cors_kwargs["allow_origin_regex"] = _private_lan_origin_regex

app.add_middleware(CORSMiddleware, **_cors_kwargs)


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
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database not reachable")
        db_ok = False

    llm = settings.LLM_PROVIDER.lower().strip()
    configured = True
    if llm == "anthropic" and not (settings.ANTHROPIC_API_KEY or "").strip():
        configured = False
    elif llm == "gemini" and not (settings.GEMINI_API_KEY or "").strip():
        configured = False
    elif llm == "azure" and not (
        (settings.AZURE_OPENAI_ENDPOINT or "").strip()
        and (settings.AZURE_OPENAI_API_KEY or "").strip()
        and (settings.AZURE_OPENAI_DEPLOYMENT or "").strip()
    ):
        configured = False

    return HealthResponse(
        status="ok" if db_ok and configured else "degraded",
        app=settings.APP_NAME,
        version=__version__,
        env=settings.APP_ENV,
        database_ok=db_ok,
        llm_provider=llm,
        llm_configured=configured,
    )


app.include_router(auth_routes.router, prefix="/api", tags=["auth"])
app.include_router(generate_routes.router, prefix="/api", tags=["generate"])
app.include_router(v2_generate_routes.router, prefix="/api", tags=["generate-v2"])
app.include_router(history_routes.router, prefix="/api", tags=["history"])
app.include_router(feedback_routes.router, prefix="/api", tags=["feedback"])


@app.get("/", tags=["meta"])
def root() -> dict:
    out = {
        "name": settings.APP_NAME,
        "version": __version__,
        "docs": "/docs",
        "health": "/api/health",
    }
    if _admin_pw:
        out["admin"] = "/admin"
    return out
