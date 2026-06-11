"""POST /api/generate — v1 Terraform generation endpoint.

Refactored into a GenerationPipeline with composable stages (§1 P1).
Route is now async (§1 P2) using AsyncAnthropic + tool-use (§3 P1).
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db import models
from app.db.schemas import ClaudeOutput, GenerateRequest, GenerateResponse
from app.services.llm.router import LLMServiceError, generate_terraform
from app.services.quality.diagram_match import (
    analyze_diagram_match,
    improvement_advice_for_canonical_baseline,
    surface_match_percent_for_canonical_baseline,
)
from app.services.quality.secret_scan import scan_generated_files
from app.services.templates.aws_microservice import (
    canonical_resources_list,
    maybe_replace_with_canonical_microservice,
)
from app.services.templates.generation_hints import build_generation_hints
from app.services.terraform.cli import run_terraform_fmt_check, run_terraform_validate
from app.services.terraform.file_diff import summarize_file_diffs
from app.services.terraform.postprocess import postprocess_generated_files

logger = logging.getLogger(__name__)
router = APIRouter()


# ── GenerationPipeline ──────────────────────────────────────────────────────

@dataclass
class PipelineResult:
    files: dict[str, str]
    assumptions: list[str]
    resources_identified: list[str]
    usage_instructions: str | None
    match_percent: int
    improvement_advice: list[str]
    security_warnings: list[str]
    terraform_validation: dict[str, Any] | None
    file_diff_summary: dict[str, Any] | None
    confidence_scores: dict[str, int] = None
    placeholders: list[str] = None
    canon_applied: bool = False

    def __post_init__(self):
        if self.confidence_scores is None:
            self.confidence_scores = {}
        if self.placeholders is None:
            self.placeholders = []


class GenerationPipeline:
    """Composable stages that transform LLM output into a persisted generation."""

    @staticmethod
    def postprocess(
        ai_output: ClaudeOutput,
        cloud_provider: str,
    ) -> tuple[dict[str, str], list[str]]:
        files, post_notes = postprocess_generated_files(
            ai_output.files, cloud_provider=cloud_provider
        )
        assumptions = list(ai_output.assumptions or []) + post_notes
        return files, assumptions

    @staticmethod
    def canonical_override(
        files: dict[str, str],
        assumptions: list[str],
        ai_output: ClaudeOutput,
        cloud_provider: str,
        environment: str,
    ) -> tuple[dict[str, str], list[str], list[str], str | None, bool]:
        if not get_settings().CANONICAL_OVERRIDE_ENABLED:
            return files, assumptions, list(ai_output.resources_identified or []), ai_output.usage_instructions, False
        files, canon_notes = maybe_replace_with_canonical_microservice(
            files=files,
            cloud_provider=cloud_provider,
            resources_identified=list(ai_output.resources_identified or []),
            environment=environment,
        )
        assumptions = assumptions + canon_notes
        resources_identified = list(ai_output.resources_identified or [])
        usage_instructions = ai_output.usage_instructions
        canon_applied = bool(canon_notes)
        if canon_applied:
            resources_identified = canonical_resources_list()
            usage_instructions = (
                "Canonical template applied for full diagram fidelity. "
                "Create terraform.tfvars with: region, name_prefix, vpc_id, public_subnet_ids, "
                "private_subnet_ids, s3_bucket_name, container_image, db_password. "
                "CloudFront default behavior → S3 (OAC). Paths matching api_path_pattern (default /api/*) "
                "→ ALB → ECS. ElastiCache and Aurora are reachable only from ECS security groups. "
                "Run: terraform init && terraform plan."
            )
        return files, assumptions, resources_identified, usage_instructions, canon_applied

    @staticmethod
    def match_score(
        cloud_provider: str,
        files: dict[str, str],
        resources_identified: list[str],
        canon_applied: bool,
        session_id: str,
        environment: str,
        improvement_advice: list[str],
    ) -> tuple[int, list[str]]:
        match_percent, advice = analyze_diagram_match(
            cloud_provider=cloud_provider,
            files=files,
            resources_identified=resources_identified,
        )
        if canon_applied:
            match_percent = surface_match_percent_for_canonical_baseline(
                session_id=session_id,
                environment=environment,
            )
            advice = improvement_advice_for_canonical_baseline(advice)
        return match_percent, advice

    @staticmethod
    def secret_scan(files: dict[str, str]) -> list[str]:
        return scan_generated_files(files)

    @staticmethod
    def file_diff(
        compare_row: models.Generation | None,
        files: dict[str, str],
    ) -> dict[str, Any] | None:
        if compare_row and compare_row.generated_files:
            return summarize_file_diffs(compare_row.generated_files, files) or None
        return None

    @staticmethod
    def validate(files: dict[str, str]) -> dict[str, Any] | None:
        settings = get_settings()
        if settings.SKIP_TERRAFORM_VALIDATE:
            return None
        validate_result = run_terraform_validate(files)
        fmt_result = run_terraform_fmt_check(files)
        return {"validate": validate_result, "fmt": fmt_result}

    @staticmethod
    async def validate_and_fix(files: dict[str, str]) -> tuple[dict[str, str], dict[str, Any] | None]:
        """§3 P1: Run validate-fix loop in v1 (mirrors v2 agent behaviour).

        Only active when V1_VALIDATE_FIX_ENABLED=true. Requires terraform CLI
        and ANTHROPIC_API_KEY (uses AsyncAnthropic fixer agent).
        Returns (possibly-fixed files, validation result dict).
        """
        settings = get_settings()
        if settings.SKIP_TERRAFORM_VALIDATE or not settings.V1_VALIDATE_FIX_ENABLED:
            return files, GenerationPipeline.validate(files)

        from app.agents.state import TerraformFiles, ValidationReport
        tf_files = TerraformFiles(**{
            "main.tf": files.get("main.tf", ""),
            "variables.tf": files.get("variables.tf", ""),
            "outputs.tf": files.get("outputs.tf", ""),
            "providers.tf": files.get("providers.tf", ""),
        })

        from app.agents.nodes.validate_fix import run_validate_fix
        from app.agents.state import GraphState, GenerationTrace
        from datetime import datetime

        dummy_state = GraphState(
            cloud_provider="aws",
            environment="dev",
            files=tf_files,
            trace=GenerationTrace(
                cloud_provider="aws",
                environment="dev",
                started_at=datetime.utcnow(),
            ),
        )
        try:
            result_state = await run_validate_fix(dummy_state)
            fixed_files = result_state.files.as_dict() if result_state.files else files
            v = result_state.validation
            validate_result = {
                "valid": v.valid,
                "iterations": v.iterations,
                "skipped": v.skipped,
                "errors": [e.model_dump() for e in (v.errors or [])],
            } if v else None
            return fixed_files, {"validate": validate_result, "fmt": run_terraform_fmt_check(fixed_files)}
        except Exception:
            return files, GenerationPipeline.validate(files)

    @classmethod
    def run(
        cls,
        *,
        ai_output: ClaudeOutput,
        cloud_provider: str,
        environment: str,
        session_id: str,
        compare_row: models.Generation | None,
    ) -> PipelineResult:
        files, assumptions = cls.postprocess(ai_output, cloud_provider)
        (
            files,
            assumptions,
            resources_identified,
            usage_instructions,
            canon_applied,
        ) = cls.canonical_override(files, assumptions, ai_output, cloud_provider, environment)

        match_percent, improvement_advice = cls.match_score(
            cloud_provider=cloud_provider,
            files=files,
            resources_identified=resources_identified,
            canon_applied=canon_applied,
            session_id=session_id,
            environment=environment,
            improvement_advice=[],
        )
        security_warnings = cls.secret_scan(files)
        file_diff_summary = cls.file_diff(compare_row, files)
        terraform_validation = cls.validate(files)

        return PipelineResult(
            files=files,
            assumptions=assumptions,
            resources_identified=resources_identified,
            usage_instructions=usage_instructions,
            match_percent=match_percent,
            improvement_advice=improvement_advice,
            security_warnings=security_warnings,
            terraform_validation=terraform_validation,
            file_diff_summary=file_diff_summary,
            confidence_scores=dict(ai_output.confidence_scores or {}),
            placeholders=list(ai_output.placeholders or []),
            canon_applied=canon_applied,
        )


# ── Helper ──────────────────────────────────────────────────────────────────

def _response_from_record(record: models.Generation, request_id: str | None) -> GenerateResponse:
    return GenerateResponse(
        generation_id=record.id,
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        input_type=record.input_type or "text",
        input_description=record.input_description,
        resources_identified=record.resources_identified or [],
        assumptions=record.assumptions or [],
        files=record.generated_files,
        usage_instructions=record.usage_instructions,
        diagram_match_percent=record.diagram_match_percent or 0,
        improvement_advice=record.improvement_advice or [],
        security_warnings=record.security_warnings or [],
        terraform_validation=record.terraform_validation,
        file_diff_summary=record.file_diff_summary,
        confidence_scores=record.confidence_scores or {},
        placeholders=record.placeholders or [],
        request_id=request_id,
        created_at=record.created_at,
    )


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post(
    "/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Terraform from a diagram or text description",
)
@limiter.limit(get_settings().RATE_LIMIT_GENERATE)
async def post_generate(
    request: Request,
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> GenerateResponse:
    try:
        payload.ensure_input_consistency()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    compare_row: models.Generation | None = None
    if payload.compare_generation_id:
        compare_row = db.get(models.Generation, payload.compare_generation_id.strip())
        if compare_row:
            # If the generation belongs to someone else, silently skip the diff
            accessible = True
            if current_user:
                if compare_row.user_id and compare_row.user_id != current_user.id:
                    accessible = False
                elif not compare_row.user_id and compare_row.session_id != payload.session_id:
                    accessible = False
            elif compare_row.session_id != payload.session_id:
                accessible = False
            if not accessible:
                compare_row = None

    hints_text = build_generation_hints(
        architecture_preset=payload.architecture_preset,
        correction_note=payload.correction_note,
    )

    try:
        ai_output = await generate_terraform(
            cloud_provider=payload.cloud_provider,
            environment=payload.environment,
            input_type=payload.input_type,
            text_description=payload.text_description,
            image_base64=payload.image_base64,
            generation_hints=hints_text or None,
            scale_tier=payload.scale_tier,
        )
    except LLMServiceError as exc:
        logger.warning("LLM service error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected LLM error")
        raise HTTPException(status_code=500, detail=f"Unexpected error during generation: {exc}") from exc

    if ai_output.provider != payload.cloud_provider:
        logger.warning(
            "Provider mismatch: LLM returned %r, request asked for %r. Continuing with requested provider.",
            ai_output.provider,
            payload.cloud_provider,
        )
        # Don't fail hard — accept the output and override the provider field
        from app.db.schemas import ClaudeOutput as _CO
        ai_output = _CO(
            provider=payload.cloud_provider,
            assumptions=ai_output.assumptions,
            resources_identified=ai_output.resources_identified,
            files=ai_output.files,
            usage_instructions=ai_output.usage_instructions,
        )

    try:
        result = GenerationPipeline.run(
            ai_output=ai_output,
            cloud_provider=payload.cloud_provider,
            environment=payload.environment,
            session_id=payload.session_id,
            compare_row=compare_row,
        )
    except Exception as exc:
        logger.exception("Pipeline error during generation")
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}") from exc

    rid = getattr(request.state, "request_id", None)

    # §3 P1: v1 validate-fix loop — only when V1_VALIDATE_FIX_ENABLED=true
    _settings = get_settings()
    if _settings.V1_VALIDATE_FIX_ENABLED and not _settings.SKIP_TERRAFORM_VALIDATE:
        try:
            result.files, result.terraform_validation = await GenerationPipeline.validate_and_fix(result.files)
        except Exception as exc:
            logger.warning("v1 validate-fix loop failed, using original files: %s", exc)

    if not payload.dry_run:
        record = models.Generation(
            session_id=payload.session_id,
            user_id=current_user.id if current_user else None,
            cloud_provider=payload.cloud_provider,
            environment=payload.environment,
            input_type=payload.input_type,
            input_description=payload.text_description,
            resources_identified=result.resources_identified,
            assumptions=result.assumptions,
            generated_files=result.files,
            usage_instructions=result.usage_instructions,
            diagram_match_percent=result.match_percent,
            improvement_advice=result.improvement_advice,
            security_warnings=result.security_warnings,
            terraform_validation=result.terraform_validation,
            file_diff_summary=result.file_diff_summary,
            confidence_scores=result.confidence_scores,
            placeholders=result.placeholders,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        logger.info(
            "Generation %s complete (match=%s%%, request_id=%s)",
            record.id,
            result.match_percent,
            rid,
        )
        resp = _response_from_record(record, rid)
        resp.token_usage = ai_output.token_usage
        return resp

    # dry_run: return without persisting
    from datetime import datetime
    import uuid
    dummy = models.Generation(
        id=str(uuid.uuid4()),
        session_id=payload.session_id,
        cloud_provider=payload.cloud_provider,
        environment=payload.environment,
        input_type=payload.input_type,
        resources_identified=result.resources_identified,
        assumptions=result.assumptions,
        generated_files=result.files,
        usage_instructions=result.usage_instructions,
        diagram_match_percent=result.match_percent,
        improvement_advice=result.improvement_advice,
        security_warnings=result.security_warnings,
        terraform_validation=result.terraform_validation,
        file_diff_summary=result.file_diff_summary,
        created_at=datetime.utcnow(),
    )
    return _response_from_record(dummy, rid)


@router.get(
    "/generation/{generation_id}",
    response_model=GenerateResponse,
    summary="Fetch a single generation by ID",
)
async def get_generation(
    generation_id: str, request: Request, db: Session = Depends(get_db)
) -> GenerateResponse:
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")
    rid = getattr(request.state, "request_id", None)
    return _response_from_record(record, rid)
