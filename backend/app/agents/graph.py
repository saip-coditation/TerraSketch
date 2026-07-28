"""Orchestrator — runs nodes in sequence with confidence gating and partial-result return.

Node registry enables re-running from an arbitrary node (H2: "re-run from node N").
Confidence gating: if a node returns confidence < threshold, return an interrupt result
instead of continuing so the caller can inject a HITL correction.
"""

from __future__ import annotations

import asyncio
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
    scale_tier: str = "small",
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
            scale_tier=scale_tier,
            session_id=session_id,
            user_id=user_id,
            request_id=request_id,
            trace=GenerationTrace(
                cloud_provider=cloud_provider,
                environment=environment,
                started_at=datetime.utcnow(),
            ),
        )

    def _result(*, error: str | None = None) -> AgentRunResult:
        state.trace.completed_at = datetime.utcnow()
        return AgentRunResult(
            diagram_ir=state.diagram_ir,
            resource_plan=state.resource_plan,
            files=state.files,
            validation=state.validation,
            clarifying_questions=state.clarifying_questions,
            trace=state.trace,
            error=error,
        )

    # Step registry — ordered list; start_from lets us skip ahead.
    # clarify is an optional post-processing step; critique + explain are handled
    # separately below since they're independent of each other (see comment there).
    steps: list[tuple[NodeName, Callable]] = [
        ("understand", run_understand),
        ("clarify", run_clarify),
        ("plan", run_plan),
        ("synthesize", run_synthesize),
        ("validate", run_validate_fix),
    ]

    # Nodes after which pending clarifying_questions pause the run — clarify's
    # structural questions must be answered before plan can run (plan needs
    # resolved node kinds); plan's configuration questions must be answered
    # before synthesize emits HCL from them.
    _clarify_gate_nodes = {"clarify", "plan"}

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
            return _result(error=state.error)

        if step_name in _clarify_gate_nodes and state.clarifying_questions:
            logger.info(
                "Clarification gate triggered at node=%s (%d question(s))",
                step_name,
                len(state.clarifying_questions),
            )
            return _result(error="needs_clarification")

        # Confidence gate: interrupt if a core node is uncertain.
        # clarify is advisory (it resolves ambiguities or defers to the user
        # via its own note, not a hard gate) — it never interrupts.
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
            return _result(error=f"confidence_interrupt:{step_name}:{node_output.confidence:.2f}")

    # critique and explain are both advisory, read-only over `state.files`/`state.trace`,
    # and don't depend on each other's output — run them concurrently instead of back
    # to back to shave one full LLM round-trip off the tail latency of every generation.
    # The only way to skip critique is start_from="explain" (re-running just the writeup).
    node_errors: list[tuple[str, Exception]] = []

    async def _guarded(name: str, fn: Callable) -> None:
        try:
            await fn(state)
        except Exception as exc:
            node_errors.append((name, exc))

    tasks = [_guarded("explain", run_explain)]
    if start_from != "explain":
        tasks.append(_guarded("critique", run_critique))
    await asyncio.gather(*tasks)

    if node_errors:
        name, exc = node_errors[0]
        logger.warning("Node %s failed: %s", name, exc)
        state.error = f"{name}: {exc}"
        return _result(error=state.error)

    return _result()


# Re-export for backwards compat with existing imports
__all__ = ["run_graph"]
