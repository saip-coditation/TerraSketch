"""Orchestrator — runs the four nodes in sequence.

Spike-quality: linear path with one internal loop (validate ↔ fix).
When swapping in LangGraph the structure maps 1:1 — each `run_*` function
becomes a node, each sequential await becomes an edge, the validate_fix
internal loop becomes a conditional edge from `validate` back to `fix`.
"""

from __future__ import annotations

from datetime import datetime

from app.agents.nodes import run_plan, run_synthesize, run_understand, run_validate_fix
from app.agents.state import (
    AgentRunResult,
    CloudProvider,
    Environment,
    GenerationTrace,
    GraphState,
)


async def run_graph(
    *,
    cloud_provider: CloudProvider,
    environment: Environment,
    image_base64: str | None = None,
    text_description: str | None = None,
) -> AgentRunResult:
    state = GraphState(
        cloud_provider=cloud_provider,
        environment=environment,
        image_base64=image_base64,
        text_description=text_description,
        trace=GenerationTrace(
            cloud_provider=cloud_provider,
            environment=environment,
            started_at=datetime.utcnow(),
        ),
    )

    state = await run_understand(state)
    state = await run_plan(state)
    state = await run_synthesize(state)
    state = await run_validate_fix(state)

    state.trace.completed_at = datetime.utcnow()

    return AgentRunResult(
        diagram_ir=state.diagram_ir,
        resource_plan=state.resource_plan,
        files=state.files,
        validation=state.validation,
        trace=state.trace,
    )
