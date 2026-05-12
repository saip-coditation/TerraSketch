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
NodeName = Literal["understand", "plan", "synthesize", "fixer", "validate", "clarify", "critique", "explain"]
TierName = Literal["public", "private", "data", "edge", "unknown"]
EdgeKind = Literal["depends_on", "ingress", "trust", "target_of", "attaches_to"]


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
    input_tokens: int = 0
    output_tokens: int = 0
    cited_contexts: list[str] = []
    raw_response: dict[str, Any] | None = None


class MultiplicityZone(BaseModel):
    """Represents instances in a single zone/AZ (e.g. {"zone": "a", "count": 2})."""
    zone: str = "default"
    count: int = Field(default=1, ge=1)


class IRNode(BaseModel):
    id: str
    label: str
    kind: str
    multiplicity: list[MultiplicityZone] = Field(
        default_factory=lambda: [MultiplicityZone()],
        description=(
            "Per-zone instance counts. Single instance = [{zone:'default',count:1}]. "
            "Multi-AZ = [{zone:'a',count:2},{zone:'b',count:2}]."
        ),
    )
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    bbox: tuple[float, float, float, float] | None = None

    @property
    def total_count(self) -> int:
        """Total instances across all zones."""
        return sum(z.count for z in self.multiplicity)


class IREdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: str = Field(alias="from")
    target: str = Field(alias="to")
    label: str | None = None
    kind: str | None = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class Ambiguity(BaseModel):
    node_id: str | None = None
    note: str


class DiagramIR(BaseModel):
    nodes: list[IRNode] = []
    edges: list[IREdge] = []
    ambiguities: list[Ambiguity] = []


class PlannedEdge(BaseModel):
    source: str
    target: str
    kind: EdgeKind = "depends_on"
    port: int | None = None


class SkippedNode(BaseModel):
    ir_node_id: str
    reason: str


class PlannedResource(BaseModel):
    local_id: str
    terraform_type: str
    purpose: str
    reasoning: str = ""
    alternatives: list[str] = []
    args: dict[str, Any] = {}
    ir_node_ids: list[str] = []


class ResourcePlan(BaseModel):
    cloud_provider: CloudProvider
    resources: list[PlannedResource] = []
    skipped: list[SkippedNode] = []
    edges: list[PlannedEdge] = []


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


class ValidationError(BaseModel):
    file: str | None = None
    line: int | None = None
    code: str | None = None
    message: str


class ValidationReport(BaseModel):
    valid: bool | None = None
    iterations: int
    errors: list[ValidationError] = []
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
    clarify: NodeOutput | None = None
    critique: NodeOutput | None = None
    explain: NodeOutput | None = None


class GraphState(BaseModel):
    cloud_provider: CloudProvider
    environment: Environment
    image_base64: str | None = None
    text_description: str | None = None

    # HITL inputs threaded from the request
    correction_note: str | None = None
    architecture_preset: str = "auto"

    # Correlation IDs
    session_id: str | None = None
    user_id: str | None = None
    request_id: str | None = None

    diagram_ir: DiagramIR | None = None
    resource_plan: ResourcePlan | None = None
    files: TerraformFiles | None = None
    validation: ValidationReport | None = None

    trace: GenerationTrace

    # Node to resume from (for re-run-from-node-N)
    start_from: NodeName | None = None
    error: str | None = None


class AgentRunResult(BaseModel):
    diagram_ir: DiagramIR | None = None
    resource_plan: ResourcePlan | None = None
    files: TerraformFiles | None = None
    validation: ValidationReport | None = None
    trace: GenerationTrace
    error: str | None = None
