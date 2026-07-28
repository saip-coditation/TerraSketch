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

_EDGE_KIND = ["depends_on", "ingress", "trust", "target_of", "attaches_to"]

_QUESTION_OPTION_ITEM: dict[str, Any] = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "description": "Human-readable option, e.g. 'db.t3.medium (mid, ~$50/mo)'."},
        "value": {"type": "string", "description": "The literal value to write into args[field] if chosen."},
    },
    "required": ["label", "value"],
}

_CONFIG_QUESTION_ITEM: dict[str, Any] = {
    "type": "object",
    "properties": {
        "target_resource_id": {"type": "string", "description": "PlannedResource.local_id this question configures."},
        "target_field": {"type": "string", "description": "The args[] key this question sets, e.g. 'instance_class'."},
        "question": {"type": "string"},
        "options": {
            "type": "array",
            "items": _QUESTION_OPTION_ITEM,
            "minItems": 2,
            "maxItems": 4,
        },
        "recommended_index": {"type": "integer", "minimum": 0, "default": 0},
    },
    "required": ["target_resource_id", "target_field", "question", "options"],
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
                        "multiplicity": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "zone": {"type": "string", "default": "default"},
                                    "count": {"type": "integer", "minimum": 1, "default": 1},
                                },
                                "required": ["count"],
                            },
                            "default": [{"zone": "default", "count": 1}],
                            "description": "Per-zone counts. [{zone:'a',count:2},{zone:'b',count:2}] for multi-AZ.",
                        },
                        "confidence": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                            "default": 1.0,
                            "description": "Per-node confidence (1.0=certain, 0.5=guessed).",
                        },
                        "bbox": {
                            "type": "array",
                            "items": {"type": "number"},
                            "minItems": 4,
                            "maxItems": 4,
                            "description": "[x_min, y_min, x_max, y_max] normalized 0-1.",
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
                        "confidence": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                            "default": 1.0,
                        },
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
                "description": "Per-node ambiguity notes (node_id may be null for global).",
            },
            "reasoning": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "decisions": {"type": "array", "items": _DECISION_ITEM},
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
                        "reasoning": {
                            "type": "string",
                            "description": "Why this resource was chosen over alternatives.",
                        },
                        "alternatives": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Alternative Terraform types considered but rejected.",
                        },
                        "args": {"type": "object"},
                        "ir_node_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["local_id", "terraform_type", "purpose"],
                },
            },
            "skipped": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ir_node_id": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["ir_node_id", "reason"],
                },
                "description": "IR nodes not mapped to resources, each with an explicit reason.",
            },
            "edges": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "target": {"type": "string"},
                        "kind": {"type": "string", "enum": _EDGE_KIND},
                        "port": {"type": "integer"},
                    },
                    "required": ["source", "target", "kind"],
                },
                "description": "Typed dependency edges between planned resources.",
            },
            "clarifying_questions": {
                "type": "array",
                "items": _CONFIG_QUESTION_ITEM,
                "description": (
                    "Up to 5 questions for sizing/access/redundancy choices not clearly "
                    "implied by the diagram or scale tier. `args` must still be filled with "
                    "a sensible default so generation can complete unanswered."
                ),
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
            "decisions": {"type": "array", "items": _DECISION_ITEM},
        },
        "required": [
            "main_tf",
            "variables_tf",
            "outputs_tf",
            "providers_tf",
            "reasoning",
        ],
    },
}
