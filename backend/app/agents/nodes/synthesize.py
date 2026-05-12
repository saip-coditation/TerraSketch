"""Synthesize: ResourcePlan → four HCL files.

Forced tool-use means the model returns a strict JSON object — no markdown
fences, no string-balancing parser. The brace-matching JSON parser in v1
exists because v1 asked the model nicely; this asks via the API contract.

S1 fix: plan_local_id comments injected into main.tf so "Why this code?" is traceable.
S3 fix: ambiguities from DiagramIR forwarded to Synth so it can inline assumptions.
S5 fix: stop_reason max_tokens guard raises rather than silently truncating.
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

    # S3: forward ambiguities so Synth can inline "I assumed X because diagram said Y"
    ambiguity_block = ""
    if state.diagram_ir and state.diagram_ir.ambiguities:
        lines = []
        for a in state.diagram_ir.ambiguities:
            prefix = f"[node:{a.node_id}]" if a.node_id else "[global]"
            lines.append(f"  - {prefix} {a.note}")
        ambiguity_block = "\nDiagram ambiguities (inline as HCL comments where relevant):\n" + "\n".join(lines)

    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}{ambiguity_block}\n\n"
        f"ResourcePlan:\n{state.resource_plan.model_dump_json(indent=2)}\n\n"
        "For each resource in main.tf add a comment on the line above its block: "
        "# plan_local_id: <local_id>   (so the plan can be traced back to the HCL)"
    )

    result = await call_tool(
        system_prompt=SYNTHESIZE_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=SUBMIT_TERRAFORM,
        check_truncation=True,
    )

    state.files = TerraformFiles(
        **{
            "main.tf": result["main_tf"],
            "variables.tf": result["variables_tf"],
            "outputs.tf": result["outputs_tf"],
            "providers.tf": result["providers_tf"],
        }
    )
    # S2: verify every args key from the plan appears somewhere in main.tf
    if state.resource_plan:
        for res in state.resource_plan.resources:
            for key in res.args:
                if key not in result.get("main_tf", ""):
                    import logging
                    logging.getLogger(__name__).warning(
                        "Synth may have ignored plan arg '%s' for resource '%s'",
                        key, res.local_id,
                    )

    state.trace.synthesize = NodeOutput(
        node="synthesize",
        reasoning=str(result.get("reasoning", "")),
        confidence=1.0,  # S4: Synth is mechanical given the plan; confidence is always 1.0
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
        input_tokens=result.pop("_input_tokens", 0),
        output_tokens=result.pop("_output_tokens", 0),
    )
    return state
