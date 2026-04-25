"""Claude (Anthropic) API integration.

Sends the system prompt + a user message containing either:
  - a base64 image block (when input_type == 'image'), or
  - a text description.

Returns the parsed ClaudeOutput.
"""

from __future__ import annotations

import base64
import logging
import re
from io import BytesIO
from typing import Any, Dict, List, Optional

from PIL import Image

from app.core.config import get_settings
from app.core.prompt_builder import SYSTEM_PROMPT, build_user_message
from app.db.schemas import ClaudeOutput
from app.services.terraform_parser import parse_claude_response

logger = logging.getLogger(__name__)


_DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)
_VALID_MEDIA_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}


class ClaudeServiceError(RuntimeError):
    """Raised when the Claude API call fails or input is invalid."""


def _strip_data_url(image_input: str) -> tuple[str, str]:
    """Return (media_type, raw_base64) from a data URL or raw base64 string.

    If the input lacks a data URL prefix we try to detect the format from
    the decoded bytes using Pillow.
    """
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
            f"Unsupported image type '{media_type or 'unknown'}'. "
            "Use PNG, JPEG, WEBP, or GIF."
        )

    return media_type, data


def _build_message_content(
    *,
    provider: str,
    environment: str,
    input_type: str,
    text_description: Optional[str],
    image_base64: Optional[str],
) -> List[Dict[str, Any]]:
    user_text = build_user_message(
        provider=provider,
        environment=environment,
        input_type=input_type,
        text_description=text_description,
    )

    content: List[Dict[str, Any]] = []
    if input_type == "image" and image_base64:
        media_type, raw_b64 = _strip_data_url(image_base64)
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": raw_b64,
                },
            }
        )

    content.append({"type": "text", "text": user_text})
    return content


def generate_terraform(
    *,
    provider: str,
    environment: str,
    input_type: str,
    text_description: Optional[str] = None,
    image_base64: Optional[str] = None,
) -> ClaudeOutput:
    """Call Claude and return the parsed Terraform output."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise ClaudeServiceError(
            "ANTHROPIC_API_KEY is not configured. Set it in your environment."
        )

    try:
        from anthropic import Anthropic
    except ImportError as exc:
        raise ClaudeServiceError(
            "anthropic SDK not installed. Run `pip install anthropic`."
        ) from exc

    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    content = _build_message_content(
        provider=provider,
        environment=environment,
        input_type=input_type,
        text_description=text_description,
        image_base64=image_base64,
    )

    logger.info(
        "Calling Claude (model=%s, provider=%s, env=%s, input=%s)",
        settings.ANTHROPIC_MODEL,
        provider,
        environment,
        input_type,
    )

    try:
        response = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as exc:
        logger.exception("Claude API call failed")
        raise ClaudeServiceError(f"Claude API call failed: {exc}") from exc

    text_chunks: List[str] = []
    for block in response.content or []:
        block_type = getattr(block, "type", None)
        if block_type == "text":
            text_chunks.append(getattr(block, "text", "") or "")

    raw_text = "\n".join(text_chunks).strip()
    if not raw_text:
        raise ClaudeServiceError("Claude returned an empty response")

    return parse_claude_response(raw_text)
