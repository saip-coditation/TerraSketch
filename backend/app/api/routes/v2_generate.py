"""POST /api/v2/generate — agentic Terraform generation.

v2 returns the full AgentRunResult including the per-node reasoning trace.
v1 (/api/generate) is untouched; both endpoints can run side-by-side while
the agent path is hardened. Persistence of agent_trace is a dev TODO —
see context.md.
"""

import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.agents import AgentRunResult, run_graph
from app.agents.llm import AgentLLMError
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.schemas import GenerateRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/v2/generate",
    response_model=AgentRunResult,
    status_code=status.HTTP_201_CREATED,
    summary="(v2) Agentic Terraform generation with per-step reasoning trace",
)
@limiter.limit(get_settings().RATE_LIMIT_GENERATE)
async def post_generate_v2(request: Request, payload: GenerateRequest) -> AgentRunResult:
    try:
        payload.ensure_input_consistency()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await run_graph(
            cloud_provider=payload.cloud_provider,
            environment=payload.environment,
            image_base64=payload.image_base64,
            text_description=payload.text_description,
        )
    except AgentLLMError as exc:
        logger.warning("Agent graph failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    rid = getattr(request.state, "request_id", None)
    logger.info(
        "v2 generation complete (request_id=%s, valid=%s, fixer_iterations=%d)",
        rid,
        result.validation.valid if result.validation else None,
        len(result.trace.fixer_iterations),
    )

    return result
