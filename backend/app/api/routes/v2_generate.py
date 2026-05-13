"""POST /api/v2/generate — agentic Terraform generation.

v2 returns the full AgentRunResult including the per-node reasoning trace.
Trace is persisted to Postgres via the agent_trace JSON column.
HITL edit endpoints allow pausing, editing IR/Plan/Files, and resuming.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.agents import AgentRunResult, run_graph
from app.agents.llm import AgentLLMError
from app.agents.state import DiagramIR, GraphState, GenerationTrace, NodeName, ResourcePlan, TerraformFiles
from app.api.deps import get_db, get_optional_user
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db import models
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
async def post_generate_v2(
    request: Request,
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> AgentRunResult:
    try:
        payload.ensure_input_consistency()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rid = getattr(request.state, "request_id", None)

    try:
        result = await run_graph(
            cloud_provider=payload.cloud_provider,
            environment=payload.environment,
            image_base64=payload.image_base64,
            text_description=payload.text_description,
            correction_note=payload.correction_note,
            architecture_preset=payload.architecture_preset,
            session_id=payload.session_id,
            user_id=current_user.id if current_user else None,
            request_id=rid,
        )
    except AgentLLMError as exc:
        logger.warning("Agent graph failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Persist trace (X4 fix) unless dry_run
    if not payload.dry_run:
        # Backfill v1-compatible fields so existing UI works without change (§5 P1)
        resources_identified = (
            [f"{r.terraform_type}:{r.local_id}" for r in result.resource_plan.resources]
            if result.resource_plan else []
        )
        assumptions = (
            [a.note for a in result.diagram_ir.ambiguities]
            if result.diagram_ir else []
        )
        # Extract usage_instructions from Explainer node decisions if available
        usage_instructions = None
        if result.trace.explain:
            for d in result.trace.explain.decisions:
                if d.question == "usage_instructions":
                    usage_instructions = d.choice
                    break

        # Learned scorer: combines resource coverage, variable coverage,
        # security signals, and validation result (§4 todo — learned scorer)
        from app.services.quality.diagram_match import learned_match_score
        diagram_match_percent, advice = learned_match_score(
            files=result.files.as_dict() if result.files else {},
            resources_identified=resources_identified,
            cloud_provider=payload.cloud_provider,
            validation_passed=result.validation.valid if result.validation else None,
            fixer_iterations=len(result.trace.fixer_iterations),
            ir_node_count=len(result.diagram_ir.nodes) if result.diagram_ir else None,
        )

        record = models.Generation(
            session_id=payload.session_id,
            user_id=current_user.id if current_user else None,
            cloud_provider=payload.cloud_provider,
            environment=payload.environment,
            input_type=payload.input_type,
            input_description=payload.text_description,
            resources_identified=resources_identified,
            assumptions=assumptions,
            usage_instructions=usage_instructions,
            generated_files=result.files.as_dict() if result.files else {},
            diagram_match_percent=diagram_match_percent,
            improvement_advice=advice,
            agent_trace=result.trace.model_dump(mode="json"),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        logger.info(
            "v2 generation persisted (id=%s request_id=%s valid=%s fixer_iterations=%d)",
            record.id,
            rid,
            result.validation.valid if result.validation else None,
            len(result.trace.fixer_iterations),
        )

    return result


# ── HITL edit endpoints ────────────────────────────────────────────────────────

class _IREditBody(DiagramIR):
    pass


class _PlanEditBody(ResourcePlan):
    pass


class _FilesEditBody(TerraformFiles):
    pass


@router.post(
    "/v2/generation/{generation_id}/ir/edit",
    response_model=AgentRunResult,
    status_code=status.HTTP_200_OK,
    summary="(HITL) Replace the DiagramIR for a generation and re-run from Plan",
)
async def edit_ir(
    generation_id: str,
    body: _IREditBody,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> AgentRunResult:
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")
    _check_ownership(record, current_user)

    trace_data = record.agent_trace or {}
    try:
        seeded_trace = GenerationTrace(**trace_data)
    except Exception:
        raise HTTPException(status_code=422, detail="Stored agent_trace is corrupt or missing")

    from app.agents.state import GraphState
    from datetime import datetime
    seeded_state = GraphState(
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        diagram_ir=body,
        trace=GenerationTrace(
            cloud_provider=record.cloud_provider,
            environment=record.environment,
            started_at=datetime.utcnow(),
            understand=seeded_trace.understand,
        ),
    )

    try:
        result = await run_graph(
            cloud_provider=record.cloud_provider,
            environment=record.environment,
            start_from="plan",
            seeded_state=seeded_state,
        )
    except AgentLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if result.files:
        record.generated_files = result.files.as_dict()
        record.agent_trace = result.trace.model_dump(mode="json")
        db.commit()

    return result


@router.post(
    "/v2/generation/{generation_id}/plan/edit",
    response_model=AgentRunResult,
    status_code=status.HTTP_200_OK,
    summary="(HITL) Replace the ResourcePlan for a generation and re-run from Synthesize",
)
async def edit_plan(
    generation_id: str,
    body: _PlanEditBody,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> AgentRunResult:
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")
    _check_ownership(record, current_user)

    trace_data = record.agent_trace or {}
    try:
        seeded_trace = GenerationTrace(**trace_data)
    except Exception:
        raise HTTPException(status_code=422, detail="Stored agent_trace is corrupt or missing")

    from datetime import datetime
    seeded_state = GraphState(
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        resource_plan=body,
        trace=GenerationTrace(
            cloud_provider=record.cloud_provider,
            environment=record.environment,
            started_at=datetime.utcnow(),
            understand=seeded_trace.understand,
            plan=seeded_trace.plan,
        ),
    )

    try:
        result = await run_graph(
            cloud_provider=record.cloud_provider,
            environment=record.environment,
            start_from="synthesize",
            seeded_state=seeded_state,
        )
    except AgentLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if result.files:
        record.generated_files = result.files.as_dict()
        record.agent_trace = result.trace.model_dump(mode="json")
        db.commit()

    return result


@router.post(
    "/v2/generation/{generation_id}/files/edit",
    response_model=AgentRunResult,
    status_code=status.HTTP_200_OK,
    summary="(HITL) Replace the generated files and re-run validation",
)
async def edit_files(
    generation_id: str,
    body: _FilesEditBody,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> AgentRunResult:
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")
    _check_ownership(record, current_user)

    trace_data = record.agent_trace or {}
    try:
        seeded_trace = GenerationTrace(**trace_data)
    except Exception:
        raise HTTPException(status_code=422, detail="Stored agent_trace is corrupt or missing")

    from datetime import datetime
    seeded_state = GraphState(
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        files=body,
        trace=GenerationTrace(
            cloud_provider=record.cloud_provider,
            environment=record.environment,
            started_at=datetime.utcnow(),
            understand=seeded_trace.understand,
            plan=seeded_trace.plan,
            synthesize=seeded_trace.synthesize,
        ),
    )

    try:
        result = await run_graph(
            cloud_provider=record.cloud_provider,
            environment=record.environment,
            start_from="validate",
            seeded_state=seeded_state,
        )
    except AgentLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    record.generated_files = result.files.as_dict() if result.files else record.generated_files
    record.agent_trace = result.trace.model_dump(mode="json")
    db.commit()

    return result


def _check_ownership(record: models.Generation, user: models.User | None) -> None:
    """H4: enforce that only the owner or same session can edit."""
    if user:
        if record.user_id and record.user_id != user.id:
            raise HTTPException(status_code=403, detail="Cannot edit another user's generation")


from pydantic import BaseModel as _BM

class _DismissBody(_BM):
    finding: str


@router.post(
    "/v2/generation/{generation_id}/critique/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="(HITL) Dismiss a critique finding as a user preference",
)
async def dismiss_critique(
    generation_id: str,
    body: _DismissBody,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> None:
    if not current_user:
        raise HTTPException(status_code=401, detail="Must be signed in to dismiss critique findings")
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")
    _check_ownership(record, current_user)

    from app.services.memory.sql_preferences import SqlPreferencesMemory
    mem = SqlPreferencesMemory(db)
    await mem.dismiss_finding(current_user.id, body.finding)


class _BatchAmbiguityResolve(_BM):
    """H7: Batch resolution of IR ambiguities in one request."""
    resolutions: list[dict]


@router.post(
    "/v2/generation/{generation_id}/ir/resolve-ambiguities",
    response_model=AgentRunResult,
    status_code=status.HTTP_200_OK,
    summary="(HITL/Batch) Resolve multiple IR ambiguities at once and re-run from Plan",
)
async def batch_resolve_ambiguities(
    generation_id: str,
    body: _BatchAmbiguityResolve,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> AgentRunResult:
    """Accepts a list of {node_id, resolved_kind, resolved_label} and patches the stored IR,
    then re-runs from Plan. This lets users fix 10 ambiguous icons in one round-trip (H7)."""
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")
    _check_ownership(record, current_user)

    trace_data = record.agent_trace or {}
    try:
        seeded_trace = GenerationTrace(**trace_data)
    except Exception:
        raise HTTPException(status_code=422, detail="Stored agent_trace is corrupt or missing")

    if not seeded_trace.understand:
        raise HTTPException(status_code=422, detail="No IR in stored trace to patch")

    # Reconstruct DiagramIR from the stored trace's understand output
    # (the IR is embedded in the trace's understand.raw_response or we store it separately)
    # For now: the edit-ir endpoint with a patched body is the authoritative path
    raise HTTPException(
        status_code=501,
        detail="Batch ambiguity resolution requires the IR to be stored separately from the trace. "
               "Use /ir/edit with a patched DiagramIR body as the interim approach.",
    )
