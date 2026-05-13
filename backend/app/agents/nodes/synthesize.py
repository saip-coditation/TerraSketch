"""Synthesize: ResourcePlan → four HCL files.

Forced tool-use means the model returns a strict JSON object — no markdown
fences, no string-balancing parser. The brace-matching JSON parser in v1
exists because v1 asked the model nicely; this asks via the API contract.

S1 fix: plan_local_id comments injected into main.tf so "Why this code?" is traceable.
S3 fix: ambiguities from DiagramIR forwarded to Synth so it can inline assumptions.
S5 fix: stop_reason max_tokens guard raises rather than silently truncating.
"""

from __future__ import annotations

import logging
import time

from app.agents.context import ContextBuilder
from app.agents.llm import AgentLLMError, call_tool
from app.agents.prompts import SYNTHESIZE_SYSTEM
from app.agents.state import (
    Decision,
    GraphState,
    NodeOutput,
    TerraformFiles,
)
from app.agents.tools import SUBMIT_TERRAFORM
from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def run_synthesize(state: GraphState) -> GraphState:
    if state.resource_plan is None:
        raise AgentLLMError("Synthesize node requires resource_plan to be set (run plan first).")

    started = time.perf_counter()
    mode = get_settings().SYNTHESIZE_MODE.lower()

    # §4 P2: Deterministic / Hybrid mode — use Python HCL writer
    if mode in ("deterministic", "hybrid"):
        from app.agents.hcl_writer import emit_terraform, can_emit_deterministically
        can_full, unknown = can_emit_deterministically(state.resource_plan)
        if mode == "deterministic" or (mode == "hybrid" and can_full):
            logger.info("Deterministic HCL emitter: mode=%s unknown_types=%s", mode, unknown)
            tf_files = emit_terraform(state.resource_plan, environment=state.environment)
            state.files = tf_files
            state.trace.synthesize = NodeOutput(
                node="synthesize",
                reasoning=(
                    f"Deterministic HCL emitter used ({mode} mode). "
                    + (f"Unknown types requiring manual HCL: {unknown}" if unknown else "All types handled.")
                ),
                confidence=1.0,
                decisions=[],
                duration_ms=int((time.perf_counter() - started) * 1000),
                cited_contexts=["hcl_writer:deterministic"],
            )
            return state
        elif mode == "hybrid":
            logger.info("Hybrid mode: falling back to LLM for unknown types: %s", unknown)

    # §6a: Use ContextBuilder to assemble prompt
    ctx = ContextBuilder.for_synthesize(state)

    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Environment: {state.environment}\n\n"
        f"{ctx}\n\n"
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
        cited_contexts=["context_builder:synthesize"],
    )
    return state
