"""Agentic Terraform generation pipeline (v2).

Four-node graph: understand → plan → synthesize → validate_fix.
Each node emits a NodeOutput {reasoning, confidence, decisions} which is
persisted into a GenerationTrace for full per-step auditability.

See `context.md` (repo root) for the architecture, decisions log, and
dev follow-ups.
"""

from app.agents.graph import run_graph
from app.agents.state import (
    AgentRunResult,
    Ambiguity,
    DiagramIR,
    GenerationTrace,
    GraphState,
    NodeOutput,
    PlannedEdge,
    PlannedResource,
    ResourcePlan,
    SkippedNode,
    TerraformFiles,
    ValidationError,
    ValidationReport,
)

__all__ = [
    "AgentRunResult",
    "Ambiguity",
    "DiagramIR",
    "GenerationTrace",
    "GraphState",
    "NodeOutput",
    "PlannedEdge",
    "PlannedResource",
    "ResourcePlan",
    "SkippedNode",
    "TerraformFiles",
    "ValidationError",
    "ValidationReport",
    "run_graph",
]
