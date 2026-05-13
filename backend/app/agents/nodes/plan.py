"""Plan: DiagramIR + cloud_provider → ResourcePlan.

Selects concrete Terraform resources and dependencies, but emits no HCL.
Separating planning from synthesis lets us swap synthesis for a deterministic
emitter (e.g. CDKTF) without touching the LLM-driven resource choice.

Uses ContextBuilder to assemble the prompt and tag any retrieved context
in NodeOutput.cited_contexts (§6 P2 fix).
"""

from __future__ import annotations

import logging
import time

from app.agents.context import ContextBuilder, RetrievedContext
from app.agents.llm import AgentLLMError, call_tool
from app.agents.prompts import PLAN_SYSTEM
from app.agents.state import (
    Decision,
    GraphState,
    NodeOutput,
    PlannedEdge,
    PlannedResource,
    ResourcePlan,
    SkippedNode,
)
from app.agents.tools import SUBMIT_RESOURCE_PLAN
from app.services.rag.terraform_schema import get_schemas_for_plan

logger = logging.getLogger(__name__)


async def run_plan(state: GraphState) -> GraphState:
    if state.diagram_ir is None:
        raise AgentLLMError("Plan node requires diagram_ir to be set (run understand first).")

    started = time.perf_counter()
    cited: list[str] = []

    # §6a: Use ContextBuilder to assemble prompt with token budget awareness
    builder = ContextBuilder(node="plan")

    # Thread HITL inputs (X1 fix: correction_note + architecture_preset)
    if state.correction_note:
        builder.add_section("User correction note", state.correction_note)
    if state.architecture_preset and state.architecture_preset != "auto":
        builder.add_section("Architecture preset", state.architecture_preset)

    builder.add_section(
        "DiagramIR",
        state.diagram_ir.model_dump_json(indent=2, by_alias=True),
    )

    # §4 P2: RAG — fetch Terraform schema for identified resource kinds
    try:
        kinds = [n.kind for n in state.diagram_ir.nodes if n.kind]
        schemas = await get_schemas_for_plan(kinds)
        for kind, schema in schemas.items():
            if schema:
                snippet = str(schema)[:800]
                rc = RetrievedContext(
                    source=f"terraform_registry:{kind}",
                    content=snippet,
                    tokens=len(snippet) // 4,
                    relevance=0.9,
                )
                builder.add_retrieved(rc)
                cited.append(rc.source)
    except Exception as exc:
        logger.debug("RAG schema fetch skipped: %s", exc)

    user_text = (
        f"Target cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}\n\n"
        f"{builder.build()}"
    )

    result = await call_tool(
        system_prompt=PLAN_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=SUBMIT_RESOURCE_PLAN,
    )

    # P4: Validate returned cloud_provider matches request
    returned_provider = result.get("cloud_provider", state.cloud_provider)
    if returned_provider != state.cloud_provider:
        raise AgentLLMError(
            f"Plan node returned cloud_provider={returned_provider!r}, "
            f"expected {state.cloud_provider!r}"
        )

    # P7: Detect silently dropped IR nodes
    planned_ir_ids: set[str] = set()
    for r in result.get("resources", []):
        planned_ir_ids.update(r.get("ir_node_ids", []))
    skipped_ids: set[str] = {s.get("ir_node_id", "") for s in result.get("skipped", []) or []}
    all_ir_ids = {n.id for n in state.diagram_ir.nodes}
    silent_drops = all_ir_ids - planned_ir_ids - skipped_ids
    if silent_drops:
        logger.warning(
            "Plan silently dropped IR nodes with no mapping or skip entry: %s",
            silent_drops,
        )

    state.resource_plan = ResourcePlan(
        cloud_provider=returned_provider,
        resources=[PlannedResource(**r) for r in result.get("resources", [])],
        skipped=[SkippedNode(**s) for s in result.get("skipped", []) or []],
        edges=[PlannedEdge(**e) for e in result.get("edges", []) or []],
    )
    state.trace.plan = NodeOutput(
        node="plan",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
        input_tokens=result.pop("_input_tokens", 0),
        output_tokens=result.pop("_output_tokens", 0),
        cited_contexts=cited,
    )
    return state
