"""Orchestrator — runs nodes in sequence with confidence gating and partial-result return.

Node registry enables re-running from an arbitrary node (H2: "re-run from node N").
Confidence gating: if a node returns confidence < threshold, return an interrupt result
instead of continuing so the caller can inject a HITL correction.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Callable

from app.agents.nodes import run_clarify, run_critique, run_explain, run_plan, run_synthesize, run_understand, run_validate_fix
from app.agents.state import (
    AgentRunResult,
    CloudProvider,
    Environment,
    GenerationTrace,
    GraphState,
    NodeName,
)

logger = logging.getLogger(__name__)

CONFIDENCE_INTERRUPT_THRESHOLD = 0.7


async def run_graph(
    *,
    cloud_provider: CloudProvider,
    environment: Environment,
    image_base64: str | None = None,
    text_description: str | None = None,
    correction_note: str | None = None,
    architecture_preset: str = "auto",
    session_id: str | None = None,
    user_id: str | None = None,
    request_id: str | None = None,
    start_from: NodeName | None = None,
    seeded_state: GraphState | None = None,
) -> AgentRunResult:
    if seeded_state is not None:
        state = seeded_state
    else:
        state = GraphState(
            cloud_provider=cloud_provider,
            environment=environment,
            image_base64=image_base64,
            text_description=text_description,
            correction_note=correction_note,
            architecture_preset=architecture_preset,
            session_id=session_id,
            user_id=user_id,
            request_id=request_id,
            trace=GenerationTrace(
                cloud_provider=cloud_provider,
                environment=environment,
                started_at=datetime.utcnow(),
            ),
        )

    # Step registry — ordered list; start_from lets us skip ahead
    # clarify, critique, explain run as optional post-processing steps
    steps: list[tuple[NodeName, Callable]] = [
        ("understand", run_understand),
        ("clarify", run_clarify),
        ("plan", run_plan),
        ("synthesize", run_synthesize),
        ("validate", run_validate_fix),
        ("critique", run_critique),
        ("explain", run_explain),
    ]

    skip = start_from is not None
    for step_name, step_fn in steps:
        if skip:
            if step_name == start_from:
                skip = False
            else:
                continue

        try:
            state = await step_fn(state)
        except Exception as exc:
            logger.warning("Node %s failed: %s", step_name, exc)
            state.error = f"{step_name}: {exc}"
            state.trace.completed_at = datetime.utcnow()
            return AgentRunResult(
                diagram_ir=state.diagram_ir,
                resource_plan=state.resource_plan,
                files=state.files,
                validation=state.validation,
                trace=state.trace,
                error=state.error,
            )

        # Confidence gate: interrupt if a core node is uncertain.
        # Post-processing nodes (clarify, critique, explain) don't interrupt — they're advisory.
        _gated_nodes = {"understand", "plan", "synthesize", "validate"}
        node_output = getattr(state.trace, step_name, None) or (
            state.trace.validate_node if step_name == "validate" else None
        )
        if step_name in _gated_nodes and node_output and node_output.confidence < CONFIDENCE_INTERRUPT_THRESHOLD:
            logger.info(
                "Confidence gate triggered at node=%s confidence=%.2f (threshold=%.2f)",
                step_name,
                node_output.confidence,
                CONFIDENCE_INTERRUPT_THRESHOLD,
            )
            state.trace.completed_at = datetime.utcnow()
            return AgentRunResult(
                diagram_ir=state.diagram_ir,
                resource_plan=state.resource_plan,
                files=state.files,
                validation=state.validation,
                trace=state.trace,
                error=f"confidence_interrupt:{step_name}:{node_output.confidence:.2f}",
            )

    state.trace.completed_at = datetime.utcnow()

    return AgentRunResult(
        diagram_ir=state.diagram_ir,
        resource_plan=state.resource_plan,
        files=state.files,
        validation=state.validation,
        trace=state.trace,
    )


# Re-export for backwards compat with existing imports
__all__ = ["run_graph"]
