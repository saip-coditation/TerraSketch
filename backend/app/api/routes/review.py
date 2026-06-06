"""POST /api/review — analyze existing Terraform files and return improvements."""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.core.review_prompt import build_review_user_message, _REVIEW_SYSTEM
from app.db.schemas import ReviewRequest, ReviewResponse, ReviewIssue

logger = logging.getLogger(__name__)
router = APIRouter()


def _detect_provider(files: dict[str, str]) -> str:
    all_hcl = "\n".join(files.values()).lower()
    if "azurerm" in all_hcl or "azure" in all_hcl:
        return "azure"
    if "google_" in all_hcl or "google-beta" in all_hcl:
        return "gcp"
    return "aws"


def _call_llm(system: str, user: str) -> str:
    """Synchronous LLM call — reuses existing provider helpers so URL/auth logic stays in one place."""
    settings = get_settings()
    provider = settings.LLM_PROVIDER.lower().strip()
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    if provider == "azure":
        from app.services.llm.azure_openai import (
            AzureOpenAIError,
            _call_openai_v1_chat,
            _call_foundry_models_chat_completions,
            _call_classic_azure_openai,
            _is_foundry_services_host,
        )

        endpoint = settings.AZURE_OPENAI_ENDPOINT
        key = settings.AZURE_OPENAI_API_KEY
        deployment = settings.AZURE_OPENAI_DEPLOYMENT
        max_tokens = settings.AZURE_OPENAI_MAX_TOKENS
        api_version = settings.AZURE_OPENAI_API_VERSION

        errors: list[str] = []

        # 1. OpenAI v1 path (works for Foundry endpoints)
        try:
            return _call_openai_v1_chat(
                endpoint=endpoint, api_key=key, deployment=deployment,
                messages=messages, max_tokens=max_tokens,
            )
        except AzureOpenAIError as exc:
            errors.append(str(exc))

        # 2. Foundry /models/chat/completions path
        if _is_foundry_services_host(endpoint):
            try:
                return _call_foundry_models_chat_completions(
                    endpoint=endpoint, api_key=key, deployment=deployment,
                    messages=messages, max_tokens=max_tokens,
                )
            except AzureOpenAIError as exc:
                errors.append(str(exc))

        # 3. Classic Azure OpenAI path
        try:
            return _call_classic_azure_openai(
                endpoint=endpoint, api_key=key, deployment=deployment,
                preferred_version=api_version, messages=messages, max_tokens=max_tokens,
            )
        except AzureOpenAIError as exc:
            errors.append(str(exc))

        raise RuntimeError(f"All Azure paths failed: {'; '.join(errors)}")

    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=settings.ANTHROPIC_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text

    if provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(model_name=settings.GEMINI_MODEL)
        resp = model.generate_content(f"{system}\n\n{user}")
        return resp.text

    # mock
    return json.dumps({
        "cloud_provider": "aws",
        "summary": "Mock mode — configure AZURE_OPENAI or ANTHROPIC_API_KEY in .env for real analysis.",
        "issues": [],
        "changes": ["No changes — mock mode active"],
        "improved_files": {},
    })


def _parse_llm_response(raw: str, original_files: dict[str, str]) -> dict:
    raw = raw.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from middle of text
        m = re.search(r"\{[\s\S]+\}", raw)
        if m:
            data = json.loads(m.group())
        else:
            raise ValueError("LLM did not return valid JSON")

    # Merge original files into improved_files for files not returned
    improved = dict(data.get("improved_files") or {})
    for fname, content in original_files.items():
        if fname not in improved:
            improved[fname] = content
    data["improved_files"] = improved
    return data


@router.post(
    "/review",
    response_model=ReviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze existing Terraform files and return improvements",
)
async def post_review(
    payload: ReviewRequest,
) -> ReviewResponse:
    import asyncio

    provider = payload.cloud_provider or _detect_provider(payload.files)
    user_msg = build_review_user_message(payload.files, provider)

    try:
        raw = await asyncio.to_thread(_call_llm, _REVIEW_SYSTEM, user_msg)
    except Exception as exc:
        logger.exception("LLM error during review")
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    try:
        data = _parse_llm_response(raw, payload.files)
    except Exception as exc:
        logger.warning("Review parse error: %s | raw: %.200s", exc, raw)
        raise HTTPException(status_code=502, detail=f"Could not parse LLM review response: {exc}") from exc

    issues = [
        ReviewIssue(
            severity=i.get("severity", "low"),
            category=i.get("category", "best_practice"),
            title=i.get("title", ""),
            detail=i.get("detail", ""),
            file=i.get("file", ""),
            fix=i.get("fix", ""),
        )
        for i in (data.get("issues") or [])
    ]

    return ReviewResponse(
        cloud_provider=data.get("cloud_provider", provider),
        summary=data.get("summary", ""),
        issues=issues,
        changes=list(data.get("changes") or []),
        improved_files=data.get("improved_files", {}),
        original_files=payload.files,
    )
