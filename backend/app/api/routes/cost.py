"""POST /api/cost/breakdown — live Infracost pricing for generated Terraform.

Returns {"available": False, "reason": ...} when Infracost isn't configured, so
the frontend silently falls back to its code-grounded estimate.
"""

import logging
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.limiter import limiter
from app.services.cost.infracost import run_infracost

logger = logging.getLogger(__name__)
router = APIRouter()


class CostRequest(BaseModel):
    files: dict[str, str] = Field(description="Terraform file contents keyed by filename")


@router.post("/cost/breakdown", summary="Live monthly cost breakdown via Infracost")
@limiter.limit(get_settings().RATE_LIMIT_GENERATE)
def post_cost_breakdown(request: Request, payload: CostRequest) -> dict[str, Any]:
    try:
        return run_infracost(payload.files)
    except Exception as exc:  # noqa: BLE001 — cost is best-effort, never 500
        logger.warning("Infracost breakdown failed: %s", exc)
        return {"available": False, "reason": str(exc)}
