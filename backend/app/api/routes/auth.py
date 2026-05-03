"""Register, login, JWT profile, and link anonymous session generations to a user."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_optional_user
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.db import models
from app.db.schemas import AttachSessionBody, TokenResponse, UserLogin, UserPublic, UserRegister

logger = logging.getLogger(__name__)
router = APIRouter()
_settings = get_settings()


def _token_for_user(user: models.User) -> TokenResponse:
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,
            email=user.email,
            name=user.name,
            marketing_opt_in=user.marketing_opt_in,
        ),
    )


@router.post(
    "/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account (email stored for product updates if you opt in)",
)
@limiter.limit(_settings.RATE_LIMIT_AUTH)
def register(request: Request, payload: UserRegister, db: Session = Depends(get_db)) -> TokenResponse:
    email_norm = payload.email.strip().lower()
    existing = db.scalars(select(models.User).where(models.User.email == email_norm)).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = models.User(
        email=email_norm,
        name=(payload.name or "").strip() or None,
        password_hash=hash_password(payload.password),
        marketing_opt_in=payload.marketing_opt_in,
        provider="email",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Registered user %s (marketing_opt_in=%s)", user.email, user.marketing_opt_in)
    return _token_for_user(user)


@router.post("/auth/login", response_model=TokenResponse, summary="Sign in with email and password")
@limiter.limit(_settings.RATE_LIMIT_AUTH)
def login(request: Request, payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    email_norm = payload.email.strip().lower()
    user = db.scalars(select(models.User).where(models.User.email == email_norm)).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _token_for_user(user)


@router.get("/auth/me", response_model=UserPublic, summary="Current user from Bearer token")
def me(user: models.User = Depends(get_current_user)) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        name=user.name,
        marketing_opt_in=user.marketing_opt_in,
    )


@router.post(
    "/auth/attach-session",
    response_model=dict,
    summary="Attach prior anonymous generations (this browser session_id) to your account",
)
def attach_session(
    payload: AttachSessionBody,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    sid = payload.session_id.strip()
    result = db.execute(
        update(models.Generation)
        .where(models.Generation.session_id == sid, models.Generation.user_id.is_(None))
        .values(user_id=user.id)
    )
    db.commit()
    linked = result.rowcount if result.rowcount is not None else 0
    return {"linked_generations": linked}


@router.post("/auth/logout", summary="Client should discard token; noop on server")
def logout(user: models.User | None = Depends(get_optional_user)) -> dict:
    return {"ok": True}
