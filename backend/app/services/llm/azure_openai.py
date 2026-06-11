"""Azure OpenAI / Microsoft Foundry integration for GPT-4o.

Microsoft documents that the **v1** OpenAI-compatible base URL works for both:

- ``https://{resource}.openai.azure.com/openai/v1/``
- ``https://{resource}.services.ai.azure.com/openai/v1/``

Using ``openai.OpenAI`` with that ``base_url`` avoids ``api-version`` errors on
Foundry project URLs that break ``AzureOpenAI`` + ``/api/projects/.../deployments/...``.

Fallbacks: Foundry ``/models/chat/completions`` (2024-05-01-preview), then classic ``AzureOpenAI``.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.core.prompt_builder import build_system_prompt, build_user_message
from app.db.schemas import ClaudeOutput
from app.services.terraform.parser import parse_claude_response

logger = logging.getLogger(__name__)

_FALLBACK_API_VERSIONS = (
    "2024-10-21",
    "2024-12-01-preview",
    "2024-08-01-preview",
    "2023-12-01-preview",
)
_FOUNDRY_CHAT_API_VERSION = "2024-05-01-preview"


class AzureOpenAIError(RuntimeError):
    """Raised when Azure OpenAI call fails."""

    def __init__(self, message: str, *, quota_exhausted: bool = False) -> None:
        super().__init__(message)
        self.quota_exhausted = quota_exhausted


def _ensure_data_url(image_base64: str) -> str:
    s = image_base64.strip()
    if s.startswith("data:"):
        return s
    return f"data:image/jpeg;base64,{s}"


def _parse_host_scheme(endpoint: str) -> tuple[str, str]:
    parsed = urlparse(endpoint.strip())
    if not parsed.hostname:
        raise AzureOpenAIError(
            f"Invalid AZURE_OPENAI_ENDPOINT: {endpoint!r}. "
            "Expected a URL with a hostname (Foundry or openai.azure.com)."
        )
    scheme = parsed.scheme or "https"
    return scheme, parsed.hostname


def _is_foundry_services_host(endpoint: str) -> bool:
    try:
        _, host = _parse_host_scheme(endpoint)
    except AzureOpenAIError:
        return False
    return host.endswith("services.ai.azure.com")


def _openai_v1_base_url(endpoint: str) -> str:
    scheme, host = _parse_host_scheme(endpoint)
    return f"{scheme}://{host}/openai/v1/"


def _foundry_base_url(endpoint: str) -> str:
    scheme, host = _parse_host_scheme(endpoint)
    return f"{scheme}://{host}"


def _extract_message_text(choice: Any) -> str:
    msg = getattr(choice, "message", None) if choice else None
    if msg is None:
        return ""
    content = getattr(msg, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
        return "".join(parts).strip()
    return ""


def _call_openai_v1_chat(
    *,
    endpoint: str,
    api_key: str,
    deployment: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
) -> str:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise AzureOpenAIError("openai SDK not installed. Run `pip install openai`.") from exc

    base_url = _openai_v1_base_url(endpoint)
    logger.info(
        "Calling Azure/Foundry OpenAI v1 chat (base_url=%s, model=%s)",
        base_url,
        deployment,
    )
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=120.0,
    )
    try:
        response = client.chat.completions.create(
            model=deployment,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.2,
        )
    except Exception as exc:
        low = str(exc).lower()
        is_quota = "429" in low or "rate limit" in low or "quota" in low
        raise AzureOpenAIError(f"OpenAI v1 chat failed: {exc}", quota_exhausted=is_quota) from exc

    choice = response.choices[0] if response.choices else None
    raw = _extract_message_text(choice)
    if not raw:
        raise AzureOpenAIError("OpenAI v1 returned an empty response")
    # Attach token usage to the response object so callers can read it
    _call_openai_v1_chat._last_usage = getattr(response, "usage", None)
    return raw


def _call_foundry_models_chat_completions(
    *,
    endpoint: str,
    api_key: str,
    deployment: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
) -> str:
    base = _foundry_base_url(endpoint)
    url = f"{base}/models/chat/completions?api-version={_FOUNDRY_CHAT_API_VERSION}"
    payload = {
        "model": deployment,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }
    headers = {"Content-Type": "application/json", "api-key": api_key}
    logger.info(
        "Calling Foundry /models/chat/completions (host=%s, api-version=%s)",
        urlparse(base).hostname,
        _FOUNDRY_CHAT_API_VERSION,
    )
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise AzureOpenAIError(f"Foundry HTTP request failed: {exc}") from exc

    if r.status_code >= 400:
        low = r.text.lower()
        is_quota = r.status_code == 429 or "rate limit" in low or "quota" in low
        raise AzureOpenAIError(
            f"Foundry chat completions failed: HTTP {r.status_code} — {r.text}",
            quota_exhausted=is_quota,
        )

    try:
        data = r.json()
    except Exception as exc:
        raise AzureOpenAIError(f"Foundry returned non-JSON: {r.text[:500]}") from exc

    choices = data.get("choices") or []
    if not choices:
        raise AzureOpenAIError(f"Foundry returned no choices: {data!r}")

    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text") or "")
        return "".join(parts).strip()
    raise AzureOpenAIError(f"Foundry message has unexpected content shape: {msg!r}")


def _call_classic_azure_openai(
    *,
    endpoint: str,
    api_key: str,
    deployment: str,
    preferred_version: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
) -> str:
    try:
        from openai import AzureOpenAI
    except ImportError as exc:
        raise AzureOpenAIError("openai SDK not installed. Run `pip install openai`.") from exc

    classic_root = _foundry_base_url(endpoint)

    def _api_versions_to_try() -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for v in (preferred_version, *_FALLBACK_API_VERSIONS):
            v = v.strip()
            if v and v not in seen:
                seen.add(v)
                ordered.append(v)
        return ordered

    last_exc: Exception | None = None
    for api_version in _api_versions_to_try():
        logger.info(
            "Calling Azure OpenAI classic (api_version=%s, deployment=%s)",
            api_version,
            deployment,
        )
        client = AzureOpenAI(
            azure_endpoint=classic_root.rstrip("/"),
            api_key=api_key,
            api_version=api_version,
        )
        try:
            response = client.chat.completions.create(
                model=deployment,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.2,
            )
            choice = response.choices[0] if response.choices else None
            raw = _extract_message_text(choice)
            if not raw:
                raise AzureOpenAIError("Azure OpenAI returned an empty response")
            return raw
        except Exception as exc:
            last_exc = exc
            message = str(exc)
            low = message.lower()
            unsupported = "api version" in low and (
                "not supported" in low or "badrequest" in low or "400" in low
            )
            if unsupported:
                logger.warning("Azure OpenAI rejected api_version=%s: %s", api_version, message)
                continue
            low2 = message.lower()
            is_quota = any(
                x in low2
                for x in (
                    "429",
                    "rate limit",
                    "quota",
                    "insufficient_quota",
                    "capacity",
                )
            )
            logger.exception("Azure OpenAI classic call failed")
            raise AzureOpenAIError(
                f"Azure OpenAI call failed: {message}", quota_exhausted=is_quota
            ) from exc

    logger.error("Azure OpenAI classic: all API versions failed: %s", last_exc)
    raise AzureOpenAIError(
        f"Azure OpenAI call failed (tried multiple api-version values): {last_exc}"
    ) from last_exc


def generate_terraform(
    *,
    cloud_provider: str,
    environment: str,
    input_type: str,
    text_description: str | None = None,
    image_base64: str | None = None,
    generation_hints: str | None = None,
    scale_tier: str = "small",
) -> ClaudeOutput:
    settings = get_settings()
    endpoint = (settings.AZURE_OPENAI_ENDPOINT or "").strip()
    key = (settings.AZURE_OPENAI_API_KEY or "").strip()
    deployment = (settings.AZURE_OPENAI_DEPLOYMENT or "").strip()
    preferred_version = (settings.AZURE_OPENAI_API_VERSION or "2024-10-21").strip()

    if not endpoint or not key or not deployment:
        raise AzureOpenAIError(
            "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, "
            "AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT in .env."
        )

    user_text = build_user_message(
        cloud_provider=cloud_provider,
        environment=environment,
        input_type=input_type,
        text_description=text_description,
        generation_hints=generation_hints,
        scale_tier=scale_tier,
    )

    if input_type == "image" and image_base64:
        image_url = _ensure_data_url(image_base64)
        user_content: str | list = [
            {"type": "text", "text": user_text},
            {"type": "image_url", "image_url": {"url": image_url, "detail": "high"}},
        ]
    else:
        user_content = user_text

    system_prompt = build_system_prompt(cloud_provider=cloud_provider)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    from app.db.schemas import TokenUsage

    errors: list[str] = []
    max_out = settings.AZURE_OPENAI_MAX_TOKENS

    def _attach_usage(output: ClaudeOutput) -> ClaudeOutput:
        usage = getattr(_call_openai_v1_chat, "_last_usage", None)
        if usage:
            output.token_usage = TokenUsage(
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                total_tokens=getattr(usage, "total_tokens", 0) or 0,
            )
        return output

    try:
        raw_text = _call_openai_v1_chat(
            endpoint=endpoint, api_key=key, deployment=deployment,
            messages=messages, max_tokens=max_out,
        )
        return _attach_usage(parse_claude_response(raw_text))
    except AzureOpenAIError as exc:
        errors.append(str(exc))
        logger.warning("OpenAI v1 path failed, trying fallbacks: %s", exc)

    if _is_foundry_services_host(endpoint):
        try:
            raw_text = _call_foundry_models_chat_completions(
                endpoint=endpoint, api_key=key, deployment=deployment,
                messages=messages, max_tokens=max_out,
            )
            return parse_claude_response(raw_text)
        except AzureOpenAIError as exc:
            errors.append(str(exc))
            logger.warning("Foundry /models path failed: %s", exc)

    try:
        raw_text = _call_classic_azure_openai(
            endpoint=endpoint, api_key=key, deployment=deployment,
            preferred_version=preferred_version, messages=messages, max_tokens=max_out,
        )
        return parse_claude_response(raw_text)
    except AzureOpenAIError as exc:
        errors.append(str(exc))

    raise AzureOpenAIError(
        "All Azure chat completion strategies failed. Errors: " + " | ".join(errors)
    )
