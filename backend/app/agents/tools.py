"""Tool-use schemas — force structured output. No JSON parsing required.

Each schema mirrors a Pydantic model in state.py. Every node's tool requires
`reasoning`, `confidence`, and (for non-trivial nodes) `decisions`. This is
how reasoning becomes a first-class output, not buried in tokens.
"""

from __future__ import annotations

from typing import Any

_DECISION_ITEM: dict[str, Any] = {
    "type": "object",
    "properties": {
        "question": {"type": "string"},
        "choice": {"type": "string"},
        "alternatives_considered": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["question", "choice"],
}


SUBMIT_DIAGRAM_IR: dict[str, Any] = {
    "name": "submit_diagram_ir",
    "description": "Return the structured intermediate representation of the diagram.",
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
                        "tier": {
                            "type": "string",
                            "enum": ["public", "private", "data", "edge", "unknown"],
                            "default": "unknown",
                        },
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
            "ambiguities": {"type": "array", "items": {"type": "string"}},
            "reasoning": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["nodes", "edges", "reasoning", "confidence"],
    },
}


SUBMIT_RESOURCE_PLAN: dict[str, Any] = {
    "name": "submit_resource_plan",
    "description": "Return the planned Terraform resources for the target provider.",
    "input_schema": {
        "type": "object",
        "properties": {
            "cloud_provider": {"type": "string", "enum": ["aws", "azure", "gcp"]},
            "resources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "local_id": {"type": "string"},
                        "terraform_type": {"type": "string"},
                        "purpose": {"type": "string"},
                        "args": {"type": "object"},
                        "depends_on_local_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "ir_node_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["local_id", "terraform_type", "purpose"],
                },
            },
            "skipped_ir_node_ids": {
                "type": "array",
                "items": {"type": "string"},
            },
            "reasoning": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "decisions": {"type": "array", "items": _DECISION_ITEM},
        },
        "required": ["cloud_provider", "resources", "reasoning", "confidence"],
    },
}


SUBMIT_TERRAFORM: dict[str, Any] = {
    "name": "submit_terraform",
    "description": "Return the four Terraform files plus reasoning.",
    "input_schema": {
        "type": "object",
        "properties": {
            "main_tf": {"type": "string"},
            "variables_tf": {"type": "string"},
            "outputs_tf": {"type": "string"},
            "providers_tf": {"type": "string"},
            "reasoning": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "decisions": {"type": "array", "items": _DECISION_ITEM},
        },
        "required": [
            "main_tf",
            "variables_tf",
            "outputs_tf",
            "providers_tf",
            "reasoning",
            "confidence",
        ],
    },
}
