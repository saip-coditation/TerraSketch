"""Claude (Anthropic) API integration — v1 path.

Uses AsyncAnthropic + forced tool-use (structured output) instead of asking
the model to return raw JSON. This eliminates the brace-matching parser
(§3 P1) and makes the route async (§1 P2).

Prompt caching is applied on the system prompt (§3 P1 prompt caching fix).
"""

from __future__ import annotations

import base64
import logging
import re
from io import BytesIO
from typing import Any

from anthropic import AsyncAnthropic
from PIL import Image

from app.core.config import get_settings
from app.core.prompt_builder import build_system_prompt, build_user_message
from app.db.schemas import ClaudeOutput

logger = logging.getLogger(__name__)

_DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)
_VALID_MEDIA_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}

# Tool schema that forces structured output from Claude in v1 (§3 P1)
_SUBMIT_V1_TERRAFORM: dict[str, Any] = {
    "name": "submit_terraform_v1",
    "description": (
        "Return the Terraform code and metadata for the requested architecture. "
        "All four files must be non-empty valid HCL."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "provider": {"type": "string", "enum": ["aws", "azure", "gcp"]},
            "assumptions": {"type": "array", "items": {"type": "string"}},
            "resources_identified": {"type": "array", "items": {"type": "string"}},
            "files": {
                "type": "object",
                "properties": {
                    "main_tf": {"type": "string"},
                    "variables_tf": {"type": "string"},
                    "outputs_tf": {"type": "string"},
                    "providers_tf": {"type": "string"},
                },
                "required": ["main_tf", "variables_tf", "outputs_tf", "providers_tf"],
            },
            "usage_instructions": {"type": "string"},
        },
        "required": ["provider", "files"],
    },
}


class ClaudeServiceError(RuntimeError):
    """Raised when the Claude API call fails or input is invalid."""


def _strip_data_url(image_input: str) -> tuple[str, str]:
    """Return (media_type, raw_base64) from a data URL or raw base64 string."""
    image_input = image_input.strip()
    match = _DATA_URL_RE.match(image_input)
    if match:
        media_type = match.group("mime").lower()
        data = match.group("data").strip()
    else:
        data = image_input
        media_type = ""

    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception as exc:
        raise ClaudeServiceError(f"image_base64 is not valid base64: {exc}") from exc

    if not media_type:
        try:
            with Image.open(BytesIO(decoded)) as img:
                fmt = (img.format or "").lower()
        except Exception as exc:
            raise ClaudeServiceError(f"Could not decode image: {exc}") from exc
        media_type = {
            "png": "image/png",
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "webp": "image/webp",
            "gif": "image/gif",
        }.get(fmt, "")

    if media_type == "image/jpg":
        media_type = "image/jpeg"

    if media_type not in _VALID_MEDIA_TYPES:
        raise ClaudeServiceError(
            f"Unsupported image type '{media_type or 'unknown'}'. Use PNG, JPEG, WEBP, or GIF."
        )
    return media_type, data


def _build_user_content(
    *,
    cloud_provider: str,
    environment: str,
    input_type: str,
    text_description: str | None,
    image_base64: str | None,
    generation_hints: str | None = None,
) -> list[dict[str, Any]]:
    user_text = build_user_message(
        cloud_provider=cloud_provider,
        environment=environment,
        input_type=input_type,
        text_description=text_description,
        generation_hints=generation_hints,
    )
    content: list[dict[str, Any]] = []
    if input_type == "image" and image_base64:
        media_type, raw_b64 = _strip_data_url(image_base64)
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": raw_b64},
            }
        )
    content.append({"type": "text", "text": user_text})
    return content


async def generate_terraform(
    *,
    cloud_provider: str,
    environment: str,
    input_type: str,
    text_description: str | None = None,
    image_base64: str | None = None,
    generation_hints: str | None = None,
) -> ClaudeOutput:
    """Call Claude with forced tool-use and return a validated ClaudeOutput."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise ClaudeServiceError("ANTHROPIC_API_KEY is not configured.")

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    content = _build_user_content(
        cloud_provider=cloud_provider,
        environment=environment,
        input_type=input_type,
        text_description=text_description,
        image_base64=image_base64,
        generation_hints=generation_hints,
    )

    system_prompt = build_system_prompt(cloud_provider=cloud_provider)
    system = [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]

    logger.info(
        "Calling Claude v1 (model=%s, cloud_provider=%s, env=%s, input=%s, thinking=%s, stream=%s)",
        settings.ANTHROPIC_MODEL,
        cloud_provider,
        environment,
        input_type,
        settings.ANTHROPIC_EXTENDED_THINKING,
        settings.ANTHROPIC_STREAM,
    )

    create_kwargs: dict[str, Any] = dict(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=settings.ANTHROPIC_MAX_TOKENS,
        system=system,
        tools=[_SUBMIT_V1_TERRAFORM],
        tool_choice={"type": "tool", "name": "submit_terraform_v1"},
        messages=[{"role": "user", "content": content}],
    )
    if settings.ANTHROPIC_EXTENDED_THINKING:
        create_kwargs["thinking"] = {
            "type": "enabled",
            "budget_tokens": settings.ANTHROPIC_THINKING_BUDGET_TOKENS,
        }

    try:
        if settings.ANTHROPIC_STREAM:
            async with client.messages.stream(**create_kwargs) as stream:
                response = await stream.get_final_message()
        else:
            response = await client.messages.create(**create_kwargs)
    except Exception as exc:
        logger.exception("Claude API call failed")
        raise ClaudeServiceError(f"Claude API call failed: {exc}") from exc

    tool_input: dict[str, Any] | None = None
    for block in response.content or []:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", None) == "submit_terraform_v1"
        ):
            tool_input = dict(getattr(block, "input", {}) or {})
            break

    if tool_input is None:
        raise ClaudeServiceError("Claude did not call the required tool 'submit_terraform_v1'.")

    files_raw = tool_input.get("files") or {}
    files = {
        "main.tf": files_raw.get("main_tf", ""),
        "variables.tf": files_raw.get("variables_tf", ""),
        "outputs.tf": files_raw.get("outputs_tf", ""),
        "providers.tf": files_raw.get("providers_tf", ""),
    }
    missing = [k for k, v in files.items() if not v.strip()]
    if missing:
        raise ClaudeServiceError(f"Claude returned empty Terraform files: {missing}")

    return ClaudeOutput(
        provider=tool_input.get("provider", cloud_provider),
        assumptions=list(tool_input.get("assumptions") or []),
        resources_identified=list(tool_input.get("resources_identified") or []),
        files=files,
        usage_instructions=tool_input.get("usage_instructions"),
    )
