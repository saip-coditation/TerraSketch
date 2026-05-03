"""GET /api/history — by account (Bearer) or anonymous session_id."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.db import models
from app.db.schemas import HistoryItem

router = APIRouter()


@router.get(
    "/history",
    response_model=List[HistoryItem],
    summary="Recent generations for your account (signed in) or browser session",
)
def get_history(
    session_id: Optional[str] = Query(
        None,
        min_length=1,
        max_length=255,
        description="Anonymous browser session id (ignored when Authorization is sent)",
    ),
    limit: int = Query(10, ge=1, le=50),
    user: models.User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> List[HistoryItem]:
    if user:
        stmt = (
            select(models.Generation)
            .where(models.Generation.user_id == user.id)
            .order_by(models.Generation.created_at.desc())
            .limit(limit)
        )
    elif session_id:
        stmt = (
            select(models.Generation)
            .where(models.Generation.session_id == session_id)
            .order_by(models.Generation.created_at.desc())
            .limit(limit)
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in or pass session_id to load history",
        )

    rows = db.execute(stmt).scalars().all()

    return [
        HistoryItem(
            generation_id=row.id,
            cloud_provider=row.cloud_provider,
            environment=row.environment,
            input_type=row.input_type,
            resources_identified=row.resources_identified or [],
            diagram_match_percent=row.diagram_match_percent,
            created_at=row.created_at,
        )
        for row in rows
    ]
