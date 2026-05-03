"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models
from app.db.session import get_db

__all__ = ["get_db", "get_optional_user", "get_current_user"]


def get_optional_user(
    authorization: Annotated[Optional[str], Header()] = None,
    db: Session = Depends(get_db),
) -> models.User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            get_settings().JWT_SECRET,
            algorithms=["HS256"],
        )
        uid = payload.get("sub")
        if not uid or not isinstance(uid, str):
            return None
        user = db.get(models.User, uid)
        return user
    except jwt.PyJWTError:
        return None


def get_current_user(
    user: models.User | None = Depends(get_optional_user),
) -> models.User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
