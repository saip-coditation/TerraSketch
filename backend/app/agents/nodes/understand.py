"""Understand: vision-only. Diagram (or text) → DiagramIR.

Emits no Terraform. Pure perception so a downstream node can plan against
a stable structure, and so the user can correct the IR before HCL is written.
"""

from __future__ import annotations

import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool, strip_data_url
from app.agents.prompts import UNDERSTAND_SYSTEM
from app.agents.state import DiagramIR, GraphState, IREdge, IRNode, NodeOutput
from app.agents.tools import SUBMIT_DIAGRAM_IR


def _user_content(state: GraphState) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    if state.image_base64:
        media_type, raw = strip_data_url(state.image_base64)
        blocks.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": raw},
            }
        )
        blocks.append(
            {
                "type": "text",
                "text": f"Provider context (for tier hints, not synthesis): {state.cloud_provider}.",
            }
        )
    if state.text_description:
        blocks.append(
            {
                "type": "text",
                "text": f'Architecture description from the user:\n"""{state.text_description.strip()}"""\nProvider: {state.cloud_provider}.',
            }
        )
    if not blocks:
        raise AgentLLMError("Understand node requires either image_base64 or text_description.")
    return blocks


async def run_understand(state: GraphState) -> GraphState:
    started = time.perf_counter()
    result = await call_tool(
        system_prompt=UNDERSTAND_SYSTEM,
        user_content=_user_content(state),
        tool=SUBMIT_DIAGRAM_IR,
    )

    state.diagram_ir = DiagramIR(
        nodes=[IRNode(**n) for n in result.get("nodes", [])],
        edges=[IREdge(**e) for e in result.get("edges", [])],
        ambiguities=list(result.get("ambiguities", []) or []),
    )
    state.trace.understand = NodeOutput(
        node="understand",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    return state
