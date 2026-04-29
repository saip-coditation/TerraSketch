"""POST /api/generate — main Terraform generation endpoint."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db import models
from app.db.schemas import GenerateRequest, GenerateResponse
from app.services.llm_service import LLMServiceError, generate_terraform
from app.services.terraform_parser import TerraformParseError
from app.services.aws_microservice_canonical import (
    canonical_resources_list,
    maybe_replace_with_canonical_microservice,
)
from app.services.terraform_postprocess import postprocess_generated_files

logger = logging.getLogger(__name__)
router = APIRouter()
_settings = get_settings()


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
) -> GenerateResponse:
    try:
        payload.ensure_input_consistency()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        ai_output = generate_terraform(
            provider=payload.cloud_provider,
            environment=payload.environment,
            input_type=payload.input_type,
            text_description=payload.text_description,
            image_base64=payload.image_base64,
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

    record = models.Generation(
        session_id=payload.session_id,
        cloud_provider=payload.cloud_provider,
        environment=payload.environment,
        input_type=payload.input_type,
        input_description=payload.text_description,
        resources_identified=ai_output.resources_identified,
        assumptions=ai_output.assumptions,
        generated_files=ai_output.files,
        usage_instructions=ai_output.usage_instructions,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return GenerateResponse(
        generation_id=record.id,
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        resources_identified=record.resources_identified or [],
        assumptions=record.assumptions or [],
        files=record.generated_files,
        usage_instructions=record.usage_instructions,
        created_at=record.created_at,
    )


@router.get(
    "/generation/{generation_id}",
    response_model=GenerateResponse,
    summary="Fetch a single generation by ID",
)
def get_generation(generation_id: str, db: Session = Depends(get_db)) -> GenerateResponse:
    record = db.get(models.Generation, generation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Generation not found")

    return GenerateResponse(
        generation_id=record.id,
        cloud_provider=record.cloud_provider,
        environment=record.environment,
        resources_identified=record.resources_identified or [],
        assumptions=record.assumptions or [],
        files=record.generated_files,
        usage_instructions=record.usage_instructions,
        created_at=record.created_at,
    )
