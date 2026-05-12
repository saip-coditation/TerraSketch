"""Explainer: aggregates upstream reasoning into user-facing text.

Populates usage_instructions, assumptions summary, and README-style notes.
No HITL gate — it's a pure narrator that reads state and writes prose.
"""

from __future__ import annotations

import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool
from app.agents.state import Decision, GraphState, NodeOutput

_EXPLAIN_SYSTEM = """You are a technical writer specialising in infrastructure documentation. Given the full generation trace (DiagramIR, ResourcePlan, validation results), produce user-facing documentation:

1. `usage_instructions`: step-by-step instructions to deploy this Terraform (init → plan → apply, required variables, prerequisites).
2. `assumptions`: a bullet list of any architectural assumptions or ambiguities that were auto-resolved.
3. `architecture_summary`: 2-3 sentences describing what this Terraform deploys and why the key choices were made.

Return via the `submit_explanation` tool."""

_EXPLAIN_TOOL: dict[str, Any] = {
    "name": "submit_explanation",
    "description": "Return user-facing documentation for the generated Terraform.",
    "input_schema": {
        "type": "object",
        "properties": {
            "usage_instructions": {"type": "string"},
            "assumptions": {"type": "array", "items": {"type": "string"}},
            "architecture_summary": {"type": "string"},
            "reasoning": {"type": "string"},
        },
        "required": ["usage_instructions", "assumptions", "architecture_summary", "reasoning"],
    },
}


async def run_explain(state: GraphState) -> GraphState:
    if state.files is None:
        raise AgentLLMError("Explain node requires files to be set.")

    started = time.perf_counter()

    # Build a condensed context from the upstream trace
    plan_summary = ""
    if state.resource_plan:
        rtypes = [r.terraform_type for r in state.resource_plan.resources]
        plan_summary = f"Resources planned: {', '.join(rtypes)}"

    ambiguity_notes = ""
    if state.diagram_ir and state.diagram_ir.ambiguities:
        lines = [f"  - {a.note}" for a in state.diagram_ir.ambiguities]
        ambiguity_notes = "Diagram ambiguities resolved:\n" + "\n".join(lines)

    validation_summary = ""
    if state.validation:
        if state.validation.valid:
            validation_summary = f"Terraform validation passed after {state.validation.iterations} iteration(s)."
        elif state.validation.skipped:
            validation_summary = "Terraform validation skipped (CLI not available)."
        else:
            validation_summary = f"Terraform validation failed after {state.validation.iterations} iteration(s)."

    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}\n\n"
        f"{plan_summary}\n"
        f"{ambiguity_notes}\n"
        f"{validation_summary}\n\n"
        f"Understand reasoning: {state.trace.understand.reasoning if state.trace.understand else ''}\n"
        f"Plan reasoning: {state.trace.plan.reasoning if state.trace.plan else ''}\n"
        f"Synthesis reasoning: {state.trace.synthesize.reasoning if state.trace.synthesize else ''}"
    )

    result = await call_tool(
        system_prompt=_EXPLAIN_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=_EXPLAIN_TOOL,
    )

    state.trace.explain = NodeOutput(
        node="explain",
        reasoning=str(result.get("reasoning", "")),
        confidence=1.0,
        decisions=[],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )

    # Attach outputs to a well-known location in trace decisions for UI
    explanation = {
        "usage_instructions": result.get("usage_instructions", ""),
        "assumptions": result.get("assumptions", []),
        "architecture_summary": result.get("architecture_summary", ""),
    }
    state.trace.explain.decisions = [
        Decision(question=k, choice=str(v)) for k, v in explanation.items()
    ]
    return state
