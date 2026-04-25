"""GET /api/history?session_id=... — last 10 generations for a session."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db import models
from app.db.schemas import HistoryItem

router = APIRouter()


@router.get(
    "/history",
    response_model=List[HistoryItem],
    summary="Fetch recent generations for a session",
)
def get_history(
    session_id: str = Query(..., min_length=1, max_length=255),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> List[HistoryItem]:
    stmt = (
        select(models.Generation)
        .where(models.Generation.session_id == session_id)
        .order_by(models.Generation.created_at.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).scalars().all()

    return [
        HistoryItem(
            generation_id=row.id,
            cloud_provider=row.cloud_provider,
            environment=row.environment,
            input_type=row.input_type,
            resources_identified=row.resources_identified or [],
            created_at=row.created_at,
        )
        for row in rows
    ]
