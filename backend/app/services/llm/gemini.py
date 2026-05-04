"""Gemini API integration for Terraform generation."""

from __future__ import annotations

import base64
import logging
import re
from io import BytesIO

from PIL import Image

from app.core.config import get_settings
from app.core.prompt_builder import SYSTEM_PROMPT, build_user_message
from app.db.schemas import ClaudeOutput
from app.services.terraform.parser import parse_claude_response

logger = logging.getLogger(__name__)

_DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)
_VALID_MEDIA_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}


class GeminiServiceError(RuntimeError):
    """Raised when Gemini API call fails or input is invalid."""

    def __init__(self, message: str, *, quota_exhausted: bool = False) -> None:
        super().__init__(message)
        self.quota_exhausted = quota_exhausted


def _strip_data_url(image_input: str) -> tuple[str, str]:
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
        raise GeminiServiceError(f"image_base64 is not valid base64: {exc}") from exc

    if not media_type:
        try:
            with Image.open(BytesIO(decoded)) as img:
                fmt = (img.format or "").lower()
        except Exception as exc:
            raise GeminiServiceError(f"Could not decode image: {exc}") from exc
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
        raise GeminiServiceError(
            f"Unsupported image type '{media_type or 'unknown'}'. Use PNG, JPEG, WEBP, or GIF."
        )
    return media_type, data


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
    if not settings.GEMINI_API_KEY:
        raise GeminiServiceError("GEMINI_API_KEY is not configured.")

    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise GeminiServiceError(
            "google-generativeai SDK not installed. Run `pip install google-generativeai`."
        ) from exc

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(model_name=settings.GEMINI_MODEL)

    prompt = build_user_message(
        provider=provider,
        environment=environment,
        input_type=input_type,
        text_description=text_description,
        generation_hints=generation_hints,
    )
    full_prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        "IMPORTANT: Return ONLY a single valid JSON object and nothing else.\n\n"
        f"{prompt}"
    )

    parts = []
    if input_type == "image" and image_base64:
        media_type, raw_b64 = _strip_data_url(image_base64)
        parts.append({"mime_type": media_type, "data": base64.b64decode(raw_b64)})
    parts.append(full_prompt)

    logger.info(
        "Calling Gemini (model=%s, provider=%s, env=%s, input=%s)",
        settings.GEMINI_MODEL,
        provider,
        environment,
        input_type,
    )

    try:
        response = model.generate_content(parts)
        raw_text = (getattr(response, "text", "") or "").strip()
    except Exception as exc:
        message = str(exc)
        low = message.lower()
        is_quota = any(
            token in low for token in ("quota", "resource_exhausted", "429", "billing", "credit")
        )
        raise GeminiServiceError(
            f"Gemini API call failed: {message}", quota_exhausted=is_quota
        ) from exc

    if not raw_text:
        raise GeminiServiceError("Gemini returned an empty response")

    return parse_claude_response(raw_text)
