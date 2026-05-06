"""Typed state for the agent graph.

GraphState threads through every node. Each node populates its slot
(diagram_ir, resource_plan, files, validation) and appends a NodeOutput
to the trace. Persist GenerationTrace to debug / replay any run.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

CloudProvider = Literal["aws", "azure", "gcp"]
Environment = Literal["dev", "staging", "production"]
NodeName = Literal["understand", "plan", "synthesize", "fixer", "validate"]
TierName = Literal["public", "private", "data", "edge", "unknown"]


class Decision(BaseModel):
    question: str
    choice: str
    alternatives_considered: list[str] = []


class NodeOutput(BaseModel):
    """Audit-trail header every node emits — independent of the artifact it produced."""

    node: NodeName
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)
    decisions: list[Decision] = []
    iteration: int = 0
    duration_ms: int = 0
    raw_response: dict[str, Any] | None = None


class IRNode(BaseModel):
    id: str
    label: str
    kind: str
    multiplicity: int = 1
    tier: TierName = "unknown"


class IREdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: str = Field(alias="from")
    target: str = Field(alias="to")
    label: str | None = None
    kind: str | None = None


class DiagramIR(BaseModel):
    nodes: list[IRNode] = []
    edges: list[IREdge] = []
    ambiguities: list[str] = []


class PlannedResource(BaseModel):
    local_id: str
    terraform_type: str
    purpose: str
    args: dict[str, Any] = {}
    depends_on_local_ids: list[str] = []
    ir_node_ids: list[str] = []


class ResourcePlan(BaseModel):
    cloud_provider: CloudProvider
    resources: list[PlannedResource] = []
    skipped_ir_node_ids: list[str] = []


class TerraformFiles(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    main_tf: str = Field(alias="main.tf")
    variables_tf: str = Field(alias="variables.tf")
    outputs_tf: str = Field(alias="outputs.tf")
    providers_tf: str = Field(alias="providers.tf")

    def as_dict(self) -> dict[str, str]:
        return {
            "main.tf": self.main_tf,
            "variables.tf": self.variables_tf,
            "outputs.tf": self.outputs_tf,
            "providers.tf": self.providers_tf,
        }


class ValidationReport(BaseModel):
    valid: bool
    iterations: int
    final_errors: str | None = None
    skipped: bool = False
    skip_reason: str | None = None


class GenerationTrace(BaseModel):
    """Per-step audit trail. JSON still uses key ``validate`` (see ``validate_node`` alias)."""

    model_config = ConfigDict(populate_by_name=True)

    cloud_provider: CloudProvider
    environment: Environment
    started_at: datetime
    completed_at: datetime | None = None
    understand: NodeOutput | None = None
    plan: NodeOutput | None = None
    synthesize: NodeOutput | None = None
    fixer_iterations: list[NodeOutput] = []
    validate_node: NodeOutput | None = Field(default=None, alias="validate")


class GraphState(BaseModel):
    cloud_provider: CloudProvider
    environment: Environment
    image_base64: str | None = None
    text_description: str | None = None

    diagram_ir: DiagramIR | None = None
    resource_plan: ResourcePlan | None = None
    files: TerraformFiles | None = None
    validation: ValidationReport | None = None

    trace: GenerationTrace


class AgentRunResult(BaseModel):
    diagram_ir: DiagramIR | None = None
    resource_plan: ResourcePlan | None = None
    files: TerraformFiles | None = None
    validation: ValidationReport | None = None
    trace: GenerationTrace
