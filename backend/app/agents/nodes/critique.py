"""Critique: security + best-practices review of generated Terraform files.

Runs in parallel with (or after) ValidateFix. Returns a list of findings.
User can dismiss each finding; dismissals stored as per-user preferences.
"""

from __future__ import annotations

import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool
from app.agents.state import Decision, GraphState, NodeOutput

_CRITIQUE_SYSTEM = """You are a Terraform security and best-practices reviewer. Given four Terraform files, identify:
1. Security misconfigurations (e.g. S3 missing public access block, overly permissive IAM, missing encryption, CloudFront over HTTP)
2. Missing best practices (e.g. no lifecycle rules on S3, no deletion protection on RDS, no monitoring/alerting resources)
3. Architecture concerns (e.g. single-AZ RDS, no NAT gateway for private subnets)

For each finding, provide:
- `severity`: "critical" | "high" | "medium" | "low"
- `resource`: the terraform resource type/name it applies to (or "global")
- `finding`: concise one-line description
- `recommendation`: how to fix it

Return your findings via the `submit_critique` tool. If no issues found, return an empty findings list."""

_CRITIQUE_TOOL: dict[str, Any] = {
    "name": "submit_critique",
    "description": "Return security and best-practices findings for the generated Terraform.",
    "input_schema": {
        "type": "object",
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {
                            "type": "string",
                            "enum": ["critical", "high", "medium", "low"],
                        },
                        "resource": {"type": "string"},
                        "finding": {"type": "string"},
                        "recommendation": {"type": "string"},
                    },
                    "required": ["severity", "resource", "finding", "recommendation"],
                },
            },
            "reasoning": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["findings", "reasoning", "confidence"],
    },
}


async def run_critique(state: GraphState) -> GraphState:
    if state.files is None:
        raise AgentLLMError("Critique node requires files to be set (run synthesize first).")

    started = time.perf_counter()
    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}\n\n"
        f"--- main.tf ---\n{state.files.main_tf}\n\n"
        f"--- variables.tf ---\n{state.files.variables_tf}\n\n"
        f"--- outputs.tf ---\n{state.files.outputs_tf}\n\n"
        f"--- providers.tf ---\n{state.files.providers_tf}"
    )

    result = await call_tool(
        system_prompt=_CRITIQUE_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=_CRITIQUE_TOOL,
    )

    findings = result.get("findings", [])
    state.trace.critique = NodeOutput(
        node="critique",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 1.0)),
        decisions=[
            Decision(
                question=f.get("resource", "?"),
                choice=f.get("finding", ""),
                alternatives_considered=[f.get("recommendation", "")],
            )
            for f in findings
        ],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    # Store findings in trace decisions for UI consumption
    return state
