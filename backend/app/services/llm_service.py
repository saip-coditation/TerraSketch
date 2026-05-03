"""LLM provider router for Terraform generation."""

from __future__ import annotations

import logging
from typing import Optional

from app.core.config import get_settings
from app.db.schemas import ClaudeOutput
from app.services.azure_openai_service import AzureOpenAIError
from app.services.claude_service import ClaudeServiceError
from app.services.gemini_service import GeminiServiceError

logger = logging.getLogger(__name__)


class LLMServiceError(RuntimeError):
    """Unified error returned to API routes."""


def generate_terraform(
    *,
    provider: str,
    environment: str,
    input_type: str,
    text_description: Optional[str] = None,
    image_base64: Optional[str] = None,
    generation_hints: Optional[str] = None,
) -> ClaudeOutput:
    settings = get_settings()
    llm_provider = settings.LLM_PROVIDER.lower().strip()
    fallback_provider = settings.LLM_FALLBACK_PROVIDER.lower().strip()

    common_args = {
        "provider": provider,
        "environment": environment,
        "input_type": input_type,
        "text_description": text_description,
        "image_base64": image_base64,
        "generation_hints": generation_hints,
    }

    if llm_provider == "mock":
        from app.services.mock_service import generate_terraform as mock_generate

        return mock_generate(**common_args)

    if llm_provider == "anthropic":
        try:
            from app.services.claude_service import generate_terraform as anthropic_generate

            return anthropic_generate(**common_args)
        except ClaudeServiceError as exc:
            raise LLMServiceError(str(exc)) from exc

    if llm_provider == "gemini":
        try:
            from app.services.gemini_service import generate_terraform as gemini_generate

            return gemini_generate(**common_args)
        except GeminiServiceError as exc:
            if exc.quota_exhausted and fallback_provider == "mock":
                logger.warning("Gemini quota exhausted; falling back to mock provider")
                from app.services.mock_service import generate_terraform as mock_generate

                return mock_generate(**common_args)
            raise LLMServiceError(str(exc)) from exc

    if llm_provider == "azure":
        try:
            from app.services.azure_openai_service import generate_terraform as azure_generate

            return azure_generate(**common_args)
        except AzureOpenAIError as exc:
            if exc.quota_exhausted and fallback_provider == "mock":
                logger.warning("Azure OpenAI quota/rate limited; falling back to mock provider")
                from app.services.mock_service import generate_terraform as mock_generate

                return mock_generate(**common_args)
            raise LLMServiceError(str(exc)) from exc

    raise LLMServiceError(
        f"Unsupported LLM_PROVIDER='{settings.LLM_PROVIDER}'. "
        "Use anthropic, gemini, azure, or mock."
    )
