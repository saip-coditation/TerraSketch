"""POST /api/generate — main Terraform generation endpoint."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db import models
from app.db.schemas import GenerateRequest, GenerateResponse
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
from app.services.terraform.parser import TerraformParseError
from app.services.terraform.postprocess import postprocess_generated_files

logger = logging.getLogger(__name__)
router = APIRouter()
_settings = get_settings()


def _response_from_record(record: models.Generation, request_id: str | None) -> GenerateResponse:
    return GenerateResponse(
        generation_id=record.id,
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        resources_identified=record.resources_identified or [],
        assumptions=record.assumptions or [],
        files=record.generated_files,
        usage_instructions=record.usage_instructions,
        diagram_match_percent=record.diagram_match_percent or 0,
        improvement_advice=record.improvement_advice or [],
        security_warnings=record.security_warnings or [],
        terraform_validation=record.terraform_validation,
        file_diff_summary=record.file_diff_summary,
        request_id=request_id,
        created_at=record.created_at,
    )


@router.post(
    "/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Terraform from a diagram or text description",
)
@limiter.limit(_settings.RATE_LIMIT_GENERATE)
def post_generate(
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
        if not compare_row:
            raise HTTPException(status_code=404, detail="compare_generation_id not found")
        if current_user:
            if compare_row.user_id:
                if compare_row.user_id != current_user.id:
                    raise HTTPException(
                        status_code=403,
                        detail="Cannot compare with a generation from another account",
                    )
            elif compare_row.session_id != payload.session_id:
                raise HTTPException(
                    status_code=403,
                    detail="Cannot compare with a generation from another session",
                )
        elif compare_row.session_id != payload.session_id:
            raise HTTPException(
                status_code=403,
                detail="Cannot compare with a generation from another session",
            )

    hints_text = build_generation_hints(
        architecture_preset=payload.architecture_preset,
        correction_note=payload.correction_note,
    )
    generation_hints = hints_text if hints_text else None

    try:
        ai_output = generate_terraform(
            provider=payload.cloud_provider,
            environment=payload.environment,
            input_type=payload.input_type,
            text_description=payload.text_description,
            image_base64=payload.image_base64,
            generation_hints=generation_hints,
        )
    except LLMServiceError as exc:
        logger.warning("LLM service error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except TerraformParseError as exc:
        logger.warning("Failed to parse Claude response: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"AI response could not be parsed: {exc}",
        ) from exc

    if ai_output.provider != payload.cloud_provider:
        logger.info(
            "AI returned provider=%s but request asked for %s. Using requested provider.",
            ai_output.provider,
            payload.cloud_provider,
        )

    files, post_notes = postprocess_generated_files(
        ai_output.files,
        cloud_provider=payload.cloud_provider,
    )
    new_assumptions = list(ai_output.assumptions or [])
    new_assumptions.extend(post_notes)

    files, canon_notes = maybe_replace_with_canonical_microservice(
        files=files,
        cloud_provider=payload.cloud_provider,
        resources_identified=list(ai_output.resources_identified or []),
        environment=payload.environment,
    )
    new_assumptions.extend(canon_notes)

    updates: dict = {"files": files, "assumptions": new_assumptions}
    if canon_notes:
        updates["resources_identified"] = canonical_resources_list()
        updates["usage_instructions"] = (
            "Canonical template applied for full diagram fidelity. "
            "Create terraform.tfvars with: region, name_prefix, vpc_id, public_subnet_ids, "
            "private_subnet_ids, s3_bucket_name, container_image, db_password. "
            "CloudFront default behavior → S3 (OAC). Paths matching api_path_pattern (default /api/*) "
            "→ ALB → ECS. ElastiCache and Aurora are reachable only from ECS security groups. "
            "Run: terraform init && terraform plan."
        )

    ai_output = ai_output.model_copy(update=updates)

    match_percent, improvement_advice = analyze_diagram_match(
        cloud_provider=payload.cloud_provider,
        files=ai_output.files,
        resources_identified=list(ai_output.resources_identified or []),
    )
    if canon_notes:
        match_percent = surface_match_percent_for_canonical_baseline(
            session_id=payload.session_id,
            environment=payload.environment,
        )
        improvement_advice = improvement_advice_for_canonical_baseline(improvement_advice)

    security_warnings = scan_generated_files(ai_output.files)

    file_diff_summary: dict | None = None
    if compare_row and compare_row.generated_files:
        summary = summarize_file_diffs(compare_row.generated_files, ai_output.files)
        file_diff_summary = summary or None

    terraform_validation: dict | None = None
    if not _settings.SKIP_TERRAFORM_VALIDATE:
        terraform_validation = {
            "validate": run_terraform_validate(ai_output.files),
            "fmt": run_terraform_fmt_check(ai_output.files),
        }

    rid = getattr(request.state, "request_id", None)

    record = models.Generation(
        session_id=payload.session_id,
        user_id=current_user.id if current_user else None,
        cloud_provider=payload.cloud_provider,
        environment=payload.environment,
        input_type=payload.input_type,
        input_description=payload.text_description,
        resources_identified=ai_output.resources_identified,
        assumptions=ai_output.assumptions,
        generated_files=ai_output.files,
        usage_instructions=ai_output.usage_instructions,
        diagram_match_percent=match_percent,
        improvement_advice=improvement_advice,
        security_warnings=security_warnings,
        terraform_validation=terraform_validation,
        file_diff_summary=file_diff_summary,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(
        "Generation %s complete (match=%s%%, request_id=%s)",
        record.id,
        match_percent,
        rid,
    )

    return _response_from_record(record, rid)


@router.get(
    "/generation/{generation_id}",
    response_model=GenerateResponse,
    summary="Fetch a single generation by ID",
)
def get_generation(
    generation_id: str, request: Request, db: Session = Depends(get_db)
) -> GenerateResponse:
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")

    rid = getattr(request.state, "request_id", None)
    return _response_from_record(record, rid)
