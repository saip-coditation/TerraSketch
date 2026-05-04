"""LLM provider router for v1 Terraform generation.

Routes the v1 generate request to the configured backend (anthropic /
gemini / azure / mock) and translates provider-specific errors into a
single LLMServiceError surfaced to the API layer.
"""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.db.schemas import ClaudeOutput
from app.services.llm.azure_openai import AzureOpenAIError
from app.services.llm.claude import ClaudeServiceError
from app.services.llm.gemini import GeminiServiceError

logger = logging.getLogger(__name__)


class LLMServiceError(RuntimeError):
    """Unified error returned to API routes."""


def generate_terraform(
    *,
    provider: str,
    environment: str,
    input_type: str,
    text_description: str | None = None,
    image_base64: str | None = None,
    generation_hints: str | None = None,
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
        from app.services.llm.mock import generate_terraform as mock_generate

        return mock_generate(**common_args)

    if llm_provider == "anthropic":
        try:
            from app.services.llm.claude import generate_terraform as anthropic_generate

            return anthropic_generate(**common_args)
        except ClaudeServiceError as exc:
            raise LLMServiceError(str(exc)) from exc

    if llm_provider == "gemini":
        try:
            from app.services.llm.gemini import generate_terraform as gemini_generate

            return gemini_generate(**common_args)
        except GeminiServiceError as exc:
            if exc.quota_exhausted and fallback_provider == "mock":
                logger.warning("Gemini quota exhausted; falling back to mock provider")
                from app.services.llm.mock import generate_terraform as mock_generate

                return mock_generate(**common_args)
            raise LLMServiceError(str(exc)) from exc

    if llm_provider == "azure":
        try:
            from app.services.llm.azure_openai import generate_terraform as azure_generate

            return azure_generate(**common_args)
        except AzureOpenAIError as exc:
            if exc.quota_exhausted and fallback_provider == "mock":
                logger.warning("Azure OpenAI quota/rate limited; falling back to mock provider")
                from app.services.llm.mock import generate_terraform as mock_generate

                return mock_generate(**common_args)
            raise LLMServiceError(str(exc)) from exc

    raise LLMServiceError(
        f"Unsupported LLM_PROVIDER='{settings.LLM_PROVIDER}'. "
        "Use anthropic, gemini, azure, or mock."
    )
