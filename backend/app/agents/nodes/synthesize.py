"""Synthesize: ResourcePlan → four HCL files.

Forced tool-use means the model returns a strict JSON object — no markdown
fences, no string-balancing parser. The brace-matching JSON parser in v1
exists because v1 asked the model nicely; this asks via the API contract.
"""

from __future__ import annotations

import time

from app.agents.llm import AgentLLMError, call_tool
from app.agents.prompts import SYNTHESIZE_SYSTEM
from app.agents.state import (
    Decision,
    GraphState,
    NodeOutput,
    TerraformFiles,
)
from app.agents.tools import SUBMIT_TERRAFORM


async def run_synthesize(state: GraphState) -> GraphState:
    if state.resource_plan is None:
        raise AgentLLMError("Synthesize node requires resource_plan to be set (run plan first).")

    started = time.perf_counter()
    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}\n\n"
        f"ResourcePlan:\n{state.resource_plan.model_dump_json(indent=2)}"
    )

    result = await call_tool(
        system_prompt=SYNTHESIZE_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=SUBMIT_TERRAFORM,
    )

    state.files = TerraformFiles(
        **{
            "main.tf": result["main_tf"],
            "variables.tf": result["variables_tf"],
            "outputs.tf": result["outputs_tf"],
            "providers.tf": result["providers_tf"],
        }
    )
    state.trace.synthesize = NodeOutput(
        node="synthesize",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    return state
