"""Async Claude wrapper.

Demonstrates the patterns the dev should reuse:
- AsyncAnthropic (don't block the event loop)
- prompt caching on system prompts (`cache_control: ephemeral`)
- forced tool-use for structured output (`tool_choice: {type: tool}`)
- explicit error type so callers can distinguish API failures from user errors
"""

from __future__ import annotations

import base64
import logging
import re
from io import BytesIO
from typing import Any

from PIL import Image

from app.core.config import get_settings

logger = logging.getLogger(__name__)


_DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)
_VALID_MEDIA_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


class AgentLLMError(RuntimeError):
    """Raised on any LLM call failure or tool-use protocol violation."""


def strip_data_url(image_input: str) -> tuple[str, str]:
    """Return (media_type, raw_base64). Detects format via Pillow if no data URL prefix."""
    image_input = image_input.strip()
    match = _DATA_URL_RE.match(image_input)
    if match:
        media_type = match.group("mime").lower()
        data = match.group("data").strip()
    else:
        media_type, data = "", image_input

    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception as exc:
        raise AgentLLMError(f"image_base64 is not valid base64: {exc}") from exc

    if not media_type:
        try:
            with Image.open(BytesIO(decoded)) as img:
                fmt = (img.format or "").lower()
        except Exception as exc:
            raise AgentLLMError(f"Could not decode image: {exc}") from exc
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
        raise AgentLLMError(
            f"Unsupported image type '{media_type or 'unknown'}'. Use PNG, JPEG, WEBP, or GIF."
        )

    return media_type, data


def _client():
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise AgentLLMError("ANTHROPIC_API_KEY is not configured.")
    try:
        from anthropic import AsyncAnthropic
    except ImportError as exc:
        raise AgentLLMError("anthropic SDK not installed.") from exc
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY), settings


async def call_tool(
    *,
    system_prompt: str,
    user_content: list[dict[str, Any]],
    tool: dict[str, Any],
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """Invoke Claude with forced tool-use. Returns the tool_input dict."""
    client, settings = _client()

    system = [
        {
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    logger.info("LLM call: model=%s tool=%s", settings.ANTHROPIC_MODEL, tool["name"])

    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=max_tokens or settings.ANTHROPIC_MAX_TOKENS,
            system=system,
            tools=[tool],
            tool_choice={"type": "tool", "name": tool["name"]},
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as exc:
        logger.exception("Anthropic API call failed")
        raise AgentLLMError(f"Anthropic API call failed: {exc}") from exc

    for block in response.content or []:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", None) == tool["name"]
        ):
            return dict(getattr(block, "input", {}) or {})

    raise AgentLLMError(f"Model did not call the required tool '{tool['name']}'.")
