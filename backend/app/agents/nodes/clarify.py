"""Clarifier: confidence-gated interrupt node.

Detects per-node ambiguities in the DiagramIR and either auto-resolves them
or raises a confidence-interrupt so the HITL layer can surface them to the user.
Blocked by U3 (per-node confidence) which is now implemented in state.py.
"""

from __future__ import annotations

import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool
from app.agents.state import Ambiguity, Decision, DiagramIR, GraphState, IRNode, NodeOutput

_CLARIFIER_SYSTEM = """You are a diagram-understanding specialist. You receive a DiagramIR that may contain ambiguous nodes (low confidence, unclear labels, or noted ambiguities). Your job is to either:
1. Auto-resolve ambiguities where you have high confidence in the correct answer.
2. Flag ambiguities that require user input (set confidence < 0.7 on those nodes).

Return the same DiagramIR structure with:
- Updated node `kind` or `label` where you auto-resolved.
- Updated `confidence` per node — lower it if you're still unsure.
- Updated `ambiguities` list — remove entries you resolved, add new ones you found.
- `reasoning`: describe each resolution and why.
- `confidence`: your overall confidence in the resolved IR.

You MUST call the `submit_diagram_ir` tool."""

_CLARIFIER_TOOL: dict[str, Any] = {
    "name": "submit_diagram_ir",
    "description": "Return the clarified intermediate representation.",
    "input_schema": {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "label": {"type": "string"},
                        "kind": {"type": "string"},
                        "multiplicity": {"type": "integer", "minimum": 1, "default": 1},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1, "default": 1.0},
                    },
                    "required": ["id", "label", "kind"],
                },
            },
            "edges": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "from": {"type": "string"},
                        "to": {"type": "string"},
                        "label": {"type": "string"},
                        "kind": {"type": "string"},
                    },
                    "required": ["from", "to"],
                },
            },
            "ambiguities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string"},
                        "note": {"type": "string"},
                    },
                    "required": ["note"],
                },
            },
            "reasoning": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["nodes", "edges", "reasoning", "confidence"],
    },
}


async def run_clarify(state: GraphState) -> GraphState:
    if state.diagram_ir is None:
        raise AgentLLMError("Clarify node requires diagram_ir (run understand first).")

    # Only invoke if there are actual ambiguities or low-confidence nodes
    low_conf_nodes = [n for n in state.diagram_ir.nodes if n.confidence < 0.7]
    if not state.diagram_ir.ambiguities and not low_conf_nodes:
        # Nothing to clarify — pass through
        return state

    started = time.perf_counter()
    user_text = (
        f"Target cloud provider: {state.cloud_provider}\n\n"
        f"Current DiagramIR (with ambiguities to resolve):\n"
        f"{state.diagram_ir.model_dump_json(indent=2, by_alias=True)}"
    )

    result = await call_tool(
        system_prompt=_CLARIFIER_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=_CLARIFIER_TOOL,
    )

    from app.agents.state import IREdge
    state.diagram_ir = DiagramIR(
        nodes=[IRNode(**n) for n in result.get("nodes", [])],
        edges=[IREdge(**e) for e in result.get("edges", [])],
        ambiguities=[
            Ambiguity(node_id=a.get("node_id"), note=a.get("note", ""))
            for a in result.get("ambiguities", [])
        ],
    )
    state.trace.clarify = NodeOutput(
        node="clarify",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    return state
