"""Plan: DiagramIR + cloud_provider → ResourcePlan.

Selects concrete Terraform resources and dependencies, but emits no HCL.
Separating planning from synthesis lets us swap synthesis for a deterministic
emitter (e.g. CDKTF) without touching the LLM-driven resource choice.
"""

from __future__ import annotations

import time

from app.agents.llm import AgentLLMError, call_tool
from app.agents.prompts import PLAN_SYSTEM
from app.agents.state import (
    Decision,
    GraphState,
    NodeOutput,
    PlannedResource,
    ResourcePlan,
)
from app.agents.tools import SUBMIT_RESOURCE_PLAN


async def run_plan(state: GraphState) -> GraphState:
    if state.diagram_ir is None:
        raise AgentLLMError("Plan node requires diagram_ir to be set (run understand first).")

    started = time.perf_counter()
    user_text = (
        f"Target cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}\n\n"
        f"DiagramIR:\n{state.diagram_ir.model_dump_json(indent=2, by_alias=True)}"
    )

    result = await call_tool(
        system_prompt=PLAN_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=SUBMIT_RESOURCE_PLAN,
    )

    state.resource_plan = ResourcePlan(
        cloud_provider=result.get("cloud_provider", state.cloud_provider),
        resources=[PlannedResource(**r) for r in result.get("resources", [])],
        skipped_ir_node_ids=list(result.get("skipped_ir_node_ids", []) or []),
    )
    state.trace.plan = NodeOutput(
        node="plan",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    return state
