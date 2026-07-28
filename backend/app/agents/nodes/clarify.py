"""Clarifier: asks the user instead of silently guessing.

Detects per-node ambiguities in the DiagramIR. High-confidence cases are
auto-resolved; anything the model isn't confident about becomes a
multiple-choice `ClarifyingQuestion` surfaced to the user (graph.py pauses
the run when any are present) instead of being silently picked.
"""

from __future__ import annotations

import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool
from app.agents.state import (
    Ambiguity,
    ClarifyingQuestion,
    Decision,
    DiagramIR,
    GraphState,
    IRNode,
    NodeOutput,
    QuestionOption,
)

_MAX_CLARIFYING_QUESTIONS = 5

_CLARIFIER_SYSTEM = """You are a diagram-understanding specialist. You receive a DiagramIR that may contain ambiguous nodes (low confidence, unclear labels, or noted ambiguities). For each node:
1. If you are >=0.9 confident in the correct `kind`/`label`, auto-resolve it silently (update the node, set confidence high, do not ask a question about it).
2. Otherwise, do NOT silently guess. Set the node's `kind` to your best guess anyway (so generation can still complete if the user doesn't answer), keep its confidence low, and add an entry to `clarifying_questions`: 2-4 concrete, mutually exclusive `kind` options (short label + the literal kind value), ordered with your best guess first (`recommended_index: 0`).

Cap yourself at the 5 most impactful questions (skip trivial/cosmetic ambiguity).

Return the same DiagramIR structure with:
- Updated node `kind`/`label` (auto-resolved or best-guess-pending-question).
- Updated `confidence` per node.
- Updated `ambiguities` list — remove entries you resolved, add new ones you found.
- `clarifying_questions`: as described above (empty list if nothing needs asking).
- `reasoning`: describe each resolution/question and why.
- `confidence`: your overall confidence in the resolved IR.

You MUST call the `submit_diagram_ir` tool."""

_QUESTION_OPTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "description": "Human-readable option, e.g. 'Application Load Balancer'."},
        "value": {"type": "string", "description": "The literal `kind` string to write if this option is chosen."},
    },
    "required": ["label", "value"],
}

_CLARIFYING_QUESTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "target_node_id": {"type": "string", "description": "IR node id this question resolves."},
        "question": {"type": "string"},
        "options": {
            "type": "array",
            "items": _QUESTION_OPTION_SCHEMA,
            "minItems": 2,
            "maxItems": 4,
        },
        "recommended_index": {"type": "integer", "minimum": 0, "default": 0},
    },
    "required": ["target_node_id", "question", "options"],
}

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
                        "multiplicity": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "zone": {"type": "string", "default": "default"},
                                    "count": {"type": "integer", "minimum": 1, "default": 1},
                                },
                            },
                            "default": [{"zone": "default", "count": 1}],
                        },
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
            "clarifying_questions": {
                "type": "array",
                "items": _CLARIFYING_QUESTION_SCHEMA,
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

    raw_questions = (result.get("clarifying_questions", []) or [])[:_MAX_CLARIFYING_QUESTIONS]
    state.clarifying_questions = [
        ClarifyingQuestion(
            id=f"structural:{q['target_node_id']}",
            kind="structural",
            target_node_id=q["target_node_id"],
            question=q["question"],
            options=[QuestionOption(**o) for o in q.get("options", [])],
            recommended_index=q.get("recommended_index", 0),
        )
        for q in raw_questions
        if q.get("target_node_id") and q.get("options")
    ]

    state.trace.clarify = NodeOutput(
        node="clarify",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    return state
