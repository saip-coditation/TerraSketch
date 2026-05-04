"""POST /api/feedback — collect user ratings on generated Terraform."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db import models
from app.db.schemas import FeedbackRequest, FeedbackResponse

router = APIRouter()


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a 1-5 star rating + optional comment for a generation",
)
def post_feedback(payload: FeedbackRequest, db: Session = Depends(get_db)) -> FeedbackResponse:
    generation = db.get(models.Generation, payload.generation_id)
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found")

    record = models.Feedback(
        generation_id=payload.generation_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return FeedbackResponse(
        id=record.id,
        generation_id=record.generation_id,
        rating=record.rating,
        comment=record.comment,
        created_at=record.created_at,
    )
