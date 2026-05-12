"""Understand: vision-only. Diagram (or text) → DiagramIR.

Emits no Terraform. Pure perception so a downstream node can plan against
a stable structure, and so the user can correct the IR before HCL is written.
cloud_provider is NOT injected here — that biases perception (U1 fix).
"""

from __future__ import annotations

import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool, strip_data_url
from app.agents.prompts import UNDERSTAND_SYSTEM
from app.agents.state import Ambiguity, Decision, DiagramIR, GraphState, IREdge, IRNode, MultiplicityZone, NodeOutput
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
        # No cloud_provider hint here — let Understand stay provider-agnostic (U1 fix)
    if state.text_description:
        blocks.append(
            {
                "type": "text",
                "text": f'Architecture description from the user:\n"""{state.text_description.strip()}"""',
            }
        )
    if not blocks:
        raise AgentLLMError("Understand node requires either image_base64 or text_description.")
    return blocks


def _parse_ambiguities(raw: list[Any]) -> list[Ambiguity]:
    result: list[Ambiguity] = []
    for item in raw or []:
        if isinstance(item, str):
            result.append(Ambiguity(note=item))
        elif isinstance(item, dict):
            result.append(Ambiguity(node_id=item.get("node_id"), note=item.get("note", "")))
    return result


async def run_understand(state: GraphState) -> GraphState:
    started = time.perf_counter()
    result = await call_tool(
        system_prompt=UNDERSTAND_SYSTEM,
        user_content=_user_content(state),
        tool=SUBMIT_DIAGRAM_IR,
    )

    def _parse_node(n: dict) -> IRNode:
        # Normalise multiplicity: int → list[MultiplicityZone] for backwards compat
        raw_mult = n.get("multiplicity", [{"zone": "default", "count": 1}])
        if isinstance(raw_mult, int):
            raw_mult = [{"zone": "default", "count": raw_mult}]
        n_copy = {**n, "multiplicity": [MultiplicityZone(**z) if isinstance(z, dict) else z for z in raw_mult]}
        return IRNode(**n_copy)

    state.diagram_ir = DiagramIR(
        nodes=[_parse_node(n) for n in result.get("nodes", [])],
        edges=[IREdge(**e) for e in result.get("edges", [])],
        ambiguities=_parse_ambiguities(result.get("ambiguities", [])),
    )
    state.trace.understand = NodeOutput(
        node="understand",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
        input_tokens=result.pop("_input_tokens", 0),
        output_tokens=result.pop("_output_tokens", 0),
    )
    return state
