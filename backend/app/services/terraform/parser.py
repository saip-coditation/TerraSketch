"""Parse the Claude response into a strongly-typed structure.

Claude is instructed to return raw JSON. In practice, models sometimes
wrap the JSON in markdown fences or include a leading explanation. This
parser handles both cases gracefully.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.db.schemas import ClaudeOutput

REQUIRED_FILES = ("main.tf", "variables.tf", "outputs.tf", "providers.tf")

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


class TerraformParseError(ValueError):
    """Raised when the Claude response cannot be parsed into Terraform output."""


def _extract_json_block(text: str) -> str:
    """Find the JSON object inside the AI response.

    Strategy:
    1. Strip surrounding markdown code fences if present.
    2. Otherwise locate the outermost balanced { ... } block.
    """
    if not text or not text.strip():
        raise TerraformParseError("Empty response from AI")

    cleaned = _FENCE_RE.sub("", text).strip()

    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    start = cleaned.find("{")
    if start == -1:
        raise TerraformParseError("No JSON object found in AI response")

    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(cleaned)):
        ch = cleaned[idx]
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return cleaned[start : idx + 1]

    raise TerraformParseError("Unbalanced JSON object in AI response")


def parse_claude_response(raw_text: str) -> ClaudeOutput:
    """Parse Claude's raw text response into a validated ClaudeOutput."""
    json_text = _extract_json_block(raw_text)

    try:
        data: dict[str, Any] = json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise TerraformParseError(f"Invalid JSON returned by AI: {exc}") from exc

    files = data.get("files")
    if not isinstance(files, dict):
        raise TerraformParseError("AI response missing 'files' object")

    missing = [name for name in REQUIRED_FILES if not files.get(name)]
    if missing:
        raise TerraformParseError(
            f"AI response missing required Terraform files: {', '.join(missing)}"
        )

    try:
        return ClaudeOutput(**data)
    except Exception as exc:
        raise TerraformParseError(f"AI response failed validation: {exc}") from exc
