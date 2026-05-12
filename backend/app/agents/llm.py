"""Async Claude wrapper.

Demonstrates the patterns the dev should reuse:
- AsyncAnthropic (don't block the event loop)
- prompt caching on system prompts (`cache_control: ephemeral`)
- forced tool-use for structured output (`tool_choice: {type: tool}`)
- explicit error type so callers can distinguish API failures from user errors
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
from io import BytesIO
from typing import Any

from PIL import Image

from app.core.config import get_settings

# X5: In-process replay seed cache. Maps (image_hash + node_name + prompt_hash) → tool_input.
# This makes re-running the same diagram from the same node deterministic within a server restart.
_REPLAY_CACHE: dict[str, dict[str, Any]] = {}
_REPLAY_CACHE_MAX = 256


def _cache_key(system_prompt: str, user_content: list[dict], tool_name: str) -> str:
    payload = json.dumps({"s": system_prompt[:200], "u": user_content, "t": tool_name}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:32]

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


def _mock_tool_response(tool_name: str, user_content: list[dict[str, Any]]) -> dict[str, Any]:
    """Return a plausible mock tool_input so v2 runs end-to-end without an API key.

    Enable by setting AGENT_MOCK_MODE=true in .env or environment.
    Produces static but structurally valid output for each node.
    """
    if tool_name == "submit_diagram_ir":
        return {
            "nodes": [
                {"id": "n1", "label": "VPC", "kind": "vpc", "multiplicity": [{"zone": "default", "count": 1}], "confidence": 0.9},
                {"id": "n2", "label": "ALB", "kind": "alb", "multiplicity": [{"zone": "default", "count": 1}], "confidence": 0.9},
                {"id": "n3", "label": "ECS Fargate", "kind": "ecs_fargate", "multiplicity": [{"zone": "a", "count": 1}, {"zone": "b", "count": 1}], "confidence": 0.85},
                {"id": "n4", "label": "RDS", "kind": "rds_mysql", "multiplicity": [{"zone": "default", "count": 1}], "confidence": 0.9},
            ],
            "edges": [
                {"from": "n2", "to": "n3", "label": "HTTP 8080"},
                {"from": "n3", "to": "n4", "label": "MySQL 3306"},
            ],
            "ambiguities": [{"node_id": "n3", "note": "Mock mode: diagram not actually analysed"}],
            "reasoning": "Mock mode — no Anthropic key configured. Static IR returned for pipeline testing.",
            "confidence": 0.8,
            "decisions": [],
            "_input_tokens": 0,
            "_output_tokens": 0,
        }
    if tool_name == "submit_resource_plan":
        return {
            "cloud_provider": "aws",
            "resources": [
                {"local_id": "main_vpc", "terraform_type": "aws_vpc", "purpose": "Main VPC", "reasoning": "Mock", "args": {"cidr_block": "10.0.0.0/16"}, "ir_node_ids": ["n1"]},
                {"local_id": "web_alb", "terraform_type": "aws_lb", "purpose": "Application Load Balancer", "reasoning": "Mock", "args": {}, "ir_node_ids": ["n2"]},
                {"local_id": "app_ecs", "terraform_type": "aws_ecs_service", "purpose": "ECS Fargate service", "reasoning": "Mock", "args": {}, "ir_node_ids": ["n3"]},
                {"local_id": "app_db", "terraform_type": "aws_db_instance", "purpose": "RDS MySQL", "reasoning": "Mock", "args": {}, "ir_node_ids": ["n4"]},
            ],
            "skipped": [],
            "edges": [
                {"source": "web_alb", "target": "app_ecs", "kind": "ingress", "port": 8080},
                {"source": "app_ecs", "target": "app_db", "kind": "ingress", "port": 3306},
            ],
            "reasoning": "Mock mode — static ResourcePlan returned for pipeline testing.",
            "confidence": 0.8,
            "decisions": [],
            "_input_tokens": 0,
            "_output_tokens": 0,
        }
    if tool_name == "submit_terraform":
        return {
            "main_tf": (
                'resource "aws_vpc" "main_vpc" {\n  cidr_block = var.vpc_cidr\n}\n\n'
                '# plan_local_id: web_alb\nresource "aws_lb" "web_alb" {\n  internal = false\n  load_balancer_type = "application"\n}\n\n'
                '# plan_local_id: app_ecs\nresource "aws_ecs_service" "app_ecs" {\n  name = var.service_name\n  launch_type = "FARGATE"\n}\n\n'
                '# plan_local_id: app_db\nresource "aws_db_instance" "app_db" {\n  engine = "mysql"\n  instance_class = var.db_instance_class\n  username = var.db_username\n  password = var.db_password\n}\n'
            ),
            "variables_tf": (
                'variable "vpc_cidr" { type = string  default = "10.0.0.0/16" }\n'
                'variable "service_name" { type = string  default = "terrasketch-mock" }\n'
                'variable "db_instance_class" { type = string  default = "db.t3.micro" }\n'
                'variable "db_username" { type = string  default = "admin" }\n'
                'variable "db_password" { type = string  sensitive = true }\n'
            ),
            "outputs_tf": 'output "alb_dns" { value = aws_lb.web_alb.dns_name }\n',
            "providers_tf": (
                'terraform {\n  required_providers {\n    aws = { source = "hashicorp/aws"  version = "~> 5.0" }\n  }\n}\n'
                'provider "aws" { region = "us-east-1" }\n'
            ),
            "reasoning": "Mock mode — static Terraform returned for pipeline testing.",
            "decisions": [],
            "_input_tokens": 0,
            "_output_tokens": 0,
        }
    # Fallback for clarify / critique / explain tools
    return {
        "reasoning": f"Mock mode — no real LLM call for tool '{tool_name}'.",
        "confidence": 0.8,
        "findings": [],
        "usage_instructions": "Mock mode output. Set ANTHROPIC_API_KEY to get real results.",
        "assumptions": ["Mock mode active"],
        "architecture_summary": "Mock pipeline run — no Anthropic key configured.",
        "nodes": [], "edges": [], "ambiguities": [],
        "decisions": [],
        "_input_tokens": 0,
        "_output_tokens": 0,
    }


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
    check_truncation: bool = False,
    use_replay_cache: bool = False,
) -> dict[str, Any]:
    """Invoke Claude with forced tool-use. Returns the tool_input dict.

    check_truncation: when True, raise AgentLLMError if stop_reason is max_tokens
    (prevents silently truncated HCL from reaching downstream consumers).
    """
    # Mock mode: return static responses without any LLM call (AGENT_MOCK_MODE=true)
    settings_check = get_settings()
    if settings_check.AGENT_MOCK_MODE:
        logger.info("AGENT_MOCK_MODE active — returning mock response for tool=%s", tool["name"])
        return _mock_tool_response(tool["name"], user_content)

    # X5: Check replay cache before hitting the API
    if use_replay_cache:
        ck = _cache_key(system_prompt, user_content, tool["name"])
        if ck in _REPLAY_CACHE:
            logger.debug("Replay cache hit for tool=%s key=%s", tool["name"], ck)
            return dict(_REPLAY_CACHE[ck])

    client, settings = _client()

    system = [
        {
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    logger.info(
        "LLM call: model=%s tool=%s thinking=%s stream=%s",
        settings.ANTHROPIC_MODEL,
        tool["name"],
        settings.ANTHROPIC_EXTENDED_THINKING,
        settings.ANTHROPIC_STREAM,
    )

    create_kwargs: dict[str, Any] = dict(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=max_tokens or settings.ANTHROPIC_MAX_TOKENS,
        system=system,
        tools=[tool],
        tool_choice={"type": "tool", "name": tool["name"]},
        messages=[{"role": "user", "content": user_content}],
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
        logger.exception("Anthropic API call failed")
        raise AgentLLMError(f"Anthropic API call failed: {exc}") from exc

    if check_truncation and getattr(response, "stop_reason", None) == "max_tokens":
        raise AgentLLMError(
            f"Response truncated by max_tokens={max_tokens or settings.ANTHROPIC_MAX_TOKENS}. "
            "Increase ANTHROPIC_MAX_TOKENS or split the request."
        )

    # Capture token usage for cost telemetry (NodeOutput.input_tokens / output_tokens)
    usage = getattr(response, "usage", None)
    _usage_input = getattr(usage, "input_tokens", 0) or 0
    _usage_output = getattr(usage, "output_tokens", 0) or 0

    for block in response.content or []:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", None) == tool["name"]
        ):
            result = dict(getattr(block, "input", {}) or {})
            result["_input_tokens"] = _usage_input
            result["_output_tokens"] = _usage_output

            # X5: Store in replay cache
            if use_replay_cache:
                ck = _cache_key(system_prompt, user_content, tool["name"])
                if len(_REPLAY_CACHE) >= _REPLAY_CACHE_MAX:
                    # Evict oldest entry
                    _REPLAY_CACHE.pop(next(iter(_REPLAY_CACHE)))
                _REPLAY_CACHE[ck] = dict(result)

            return result

    raise AgentLLMError(f"Model did not call the required tool '{tool['name']}'.")
