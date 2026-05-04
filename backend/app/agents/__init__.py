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
    DiagramIR,
    GenerationTrace,
    GraphState,
    NodeOutput,
    ResourcePlan,
    TerraformFiles,
    ValidationReport,
)

__all__ = [
    "AgentRunResult",
    "DiagramIR",
    "GenerationTrace",
    "GraphState",
    "NodeOutput",
    "ResourcePlan",
    "TerraformFiles",
    "ValidationReport",
    "run_graph",
]
