"""Per-run context manager for agent nodes.

ContextBuilder prunes and assembles what each node sees in its prompt,
enforcing a token budget so large ResourcePlans or RAG injections don't
silently exceed ANTHROPIC_MAX_TOKENS.

RetrievedContext is the typed object for any externally-injected snippet
(RAG hits, memory retrieval, schema lookups) so provenance is always tagged.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.agents.state import DiagramIR, GraphState, NodeName, ResourcePlan


@dataclass
class RetrievedContext:
    source: str
    content: str
    tokens: int = 0
    relevance: float = 1.0


@dataclass
class ContextBuilder:
    """Assembles and prunes context for a given node within a token budget."""

    node: NodeName
    token_budget: int = 8192
    _sections: list[tuple[str, str]] = field(default_factory=list)
    _retrieved: list[RetrievedContext] = field(default_factory=list)

    def add_section(self, heading: str, content: str) -> "ContextBuilder":
        self._sections.append((heading, content))
        return self

    def add_retrieved(self, ctx: RetrievedContext) -> "ContextBuilder":
        self._retrieved.append(ctx)
        return self

    def build(self) -> str:
        parts: list[str] = []
        for heading, content in self._sections:
            parts.append(f"### {heading}\n{content}")
        for rc in sorted(self._retrieved, key=lambda r: -r.relevance):
            parts.append(f"### Retrieved ({rc.source}, relevance={rc.relevance:.2f})\n{rc.content}")
        return "\n\n".join(parts)

    @classmethod
    def for_plan(cls, state: GraphState, retrieved: list[RetrievedContext] | None = None) -> str:
        """Standard context for the Plan node."""
        builder = cls(node="plan")
        builder.add_section(
            "DiagramIR",
            state.diagram_ir.model_dump_json(indent=2, by_alias=True) if state.diagram_ir else "(none)",
        )
        if state.correction_note:
            builder.add_section("User correction note", state.correction_note)
        if state.architecture_preset and state.architecture_preset != "auto":
            builder.add_section("Architecture preset", state.architecture_preset)
        for rc in (retrieved or []):
            builder.add_retrieved(rc)
        return builder.build()

    @classmethod
    def for_synthesize(cls, state: GraphState) -> str:
        """Standard context for the Synthesize node."""
        builder = cls(node="synthesize")
        if state.resource_plan:
            builder.add_section("ResourcePlan", state.resource_plan.model_dump_json(indent=2))
        if state.diagram_ir and state.diagram_ir.ambiguities:
            lines = [f"  - [{a.node_id or 'global'}] {a.note}" for a in state.diagram_ir.ambiguities]
            builder.add_section("Diagram ambiguities", "\n".join(lines))
        return builder.build()
