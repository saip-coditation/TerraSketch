"""POST /api/feedback — collect user ratings on generated Terraform."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.core.email import send_feedback_email
from app.db import models
from app.db.schemas import FeedbackRequest, FeedbackResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a 1-5 star rating + optional comment for a generation",
)
async def post_feedback(
    payload: FeedbackRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> FeedbackResponse:
    generation = db.get(models.Generation, payload.generation_id)
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found")

    record = models.Feedback(
        generation_id=payload.generation_id,
        user_id=current_user.id if current_user else None,
        feedback_type=payload.feedback_type,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Fire-and-forget email — never delays the HTTP response
    background_tasks.add_task(
        asyncio.ensure_future,
        send_feedback_email(
            generation_id=payload.generation_id,
            rating=payload.rating,
            feedback_type=payload.feedback_type,
            comment=payload.comment,
            user_id=current_user.id if current_user else None,
        ),
    )

    return FeedbackResponse(
        id=record.id,
        generation_id=record.generation_id,
        user_id=record.user_id,
        feedback_type=record.feedback_type,
        rating=record.rating,
        comment=record.comment,
        created_at=record.created_at,
    )
