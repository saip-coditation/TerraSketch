"""Canonical AWS microservice template loader.

HCL bodies live as real `.tf` files alongside this module so they can be
edited with a Terraform language server, formatted with `terraform fmt`,
and reviewed as code instead of as Python string literals.

Pattern matched:
  CloudFront → S3 (static, OAC) + CloudFront → ALB → ECS Fargate
  Data tier: ElastiCache (Redis), Aurora MySQL, DynamoDB

Applied after the LLM pass when the identified resources match this set,
so output structurally reflects the diagram even if the model omits
origins or wiring.
"""

from __future__ import annotations

import re
from pathlib import Path

_TEMPLATE_DIR = Path(__file__).parent


def _load(name: str) -> str:
    return (_TEMPLATE_DIR / name).read_text(encoding="utf-8")


def _resource_blob(resources: list[str], main_tf: str) -> str:
    parts = [x.lower() for x in (resources or [])]
    return " ".join(parts) + " " + (main_tf or "").lower()


def should_apply_canonical_microservice(
    *,
    cloud_provider: str,
    resources_identified: list[str],
    main_tf: str,
) -> bool:
    if cloud_provider.lower().strip() != "aws":
        return False
    blob = _resource_blob(resources_identified, main_tf)
    need = [
        re.search(r"cloud\s*front|cloudfront", blob),
        re.search(r"\bs3\b|simple\s*storage|storage\s*bucket", blob),
        re.search(r"\balb\b|application\s*load|load\s*balancer", blob),
        re.search(r"\becs\b|elastic\s*container|fargate", blob),
        re.search(r"elasticache|elastic\s*cache|redis", blob),
        re.search(r"aurora", blob),
        re.search(r"dynamodb|dynamo\s*db", blob),
    ]
    return all(m is not None for m in need)


def get_canonical_microservice_files(*, environment: str) -> dict[str, str]:
    """Return the four-file bundle; caller sets name_prefix via tfvars."""
    env_slug = re.sub(r"[^a-z0-9-]", "-", environment.lower().strip()) or "dev"
    defaults_comment = (
        f"# Suggested terraform.tfvars starter (edit bucket, image, db_password):\n"
        f"# The stack creates its own VPC/subnets — no vpc_id/subnet_ids needed.\n"
        f'# region = "us-east-1"\n'
        f'# name_prefix = "terrasketch-{env_slug}"\n'
        f'# s3_bucket_name = "my-unique-static-bucket-{env_slug}"\n'
        f'# container_image = "public.ecr.aws/docker/library/nginx:latest"\n'
        f'# db_password = "CHANGE_ME"\n'
    )
    variables = defaults_comment + "\n" + _load("variables.tf")
    return {
        "main.tf": _load("main.tf"),
        "variables.tf": variables,
        "outputs.tf": _load("outputs.tf"),
        "providers.tf": _load("providers.tf"),
    }


def maybe_replace_with_canonical_microservice(
    *,
    files: dict[str, str],
    cloud_provider: str,
    resources_identified: list[str],
    environment: str,
) -> tuple[dict[str, str], list[str]]:
    """If the diagram matches the 7-component microservice, replace files with the canonical template.

    The swap is now made explicit to the user via assumptions (§4 P2):
    - A clearly-labelled [CANONICAL_OVERRIDE] assumption is prepended.
    - The original LLM output is NOT silently discarded — users can bypass
      by using v2 which has no canonical override.
    """
    import logging
    _log = logging.getLogger(__name__)

    main = files.get("main.tf", "")
    if not should_apply_canonical_microservice(
        cloud_provider=cloud_provider,
        resources_identified=resources_identified,
        main_tf=main,
    ):
        return files, []

    _log.info(
        "Canonical AWS microservice override applied (provider=%s). "
        "LLM output replaced with validated template. Use v2 to bypass.",
        cloud_provider,
    )

    canonical = get_canonical_microservice_files(environment=environment)
    notes = [
        "[CANONICAL_OVERRIDE] Your diagram matched the 7-component AWS microservice pattern "
        "(CloudFront + S3 + ALB + ECS Fargate + ElastiCache + Aurora + DynamoDB). "
        "The LLM output has been replaced with a validated production template to ensure "
        "all wiring is correct. To use the raw LLM output instead, switch to v2 generation "
        "which does not apply canonical overrides.",
        "The stack is self-contained (creates its own VPC, subnets, internet gateway "
        "and routing). Provide s3_bucket_name, container_image, and db_password via "
        "terraform.tfvars; everything else has a sensible default.",
    ]
    return canonical, notes


def canonical_resources_list() -> list[str]:
    return [
        "Amazon CloudFront",
        "Amazon S3",
        "ALB",
        "Amazon ECS",
        "Amazon ElastiCache",
        "Amazon Aurora",
        "Amazon DynamoDB",
    ]


# Fixed multiple-choice config questions for the canonical microservice. The
# template is vetted and its knobs are known, so these are deterministic (no LLM
# call). Each answer maps to template variable defaults via
# apply_microservice_config_answers(). Shape matches the frontend
# ClarifyingQuestions.jsx renderer (button-group, no free text).
_MICROSERVICE_QUESTIONS: list[dict] = [
    {
        "id": "config:ecs_size",
        "kind": "configuration",
        "question": "How much CPU/memory should each app container (ECS Fargate) get?",
        "options": [
            {"label": "Small — 0.25 vCPU / 512 MB", "value": "256/512"},
            {"label": "Medium — 0.5 vCPU / 1 GB", "value": "512/1024"},
            {"label": "Large — 1 vCPU / 2 GB", "value": "1024/2048"},
        ],
        "recommended_index": 1,
    },
    {
        "id": "config:ecs_desired_count",
        "kind": "configuration",
        "question": "How many app containers should run (scaling / availability)?",
        "options": [
            {"label": "1 — cheapest, no redundancy", "value": "1"},
            {"label": "2 — redundant across AZs", "value": "2"},
            {"label": "4 — higher throughput", "value": "4"},
        ],
        "recommended_index": 1,
    },
    {
        "id": "config:aurora_instance_class",
        "kind": "configuration",
        "question": "What size should the Aurora MySQL database be?",
        "options": [
            {"label": "db.t4g.medium — burstable, low cost", "value": "db.t4g.medium"},
            {"label": "db.r6g.large — memory-optimized, production", "value": "db.r6g.large"},
        ],
        "recommended_index": 0,
    },
    {
        "id": "config:log_retention_days",
        "kind": "configuration",
        "question": "How long should CloudWatch keep the application logs?",
        "options": [
            {"label": "7 days", "value": "7"},
            {"label": "30 days", "value": "30"},
            {"label": "90 days", "value": "90"},
        ],
        "recommended_index": 0,
    },
    {
        "id": "config:backup_retention_period",
        "kind": "configuration",
        "question": "How many days of automated database backups do you want?",
        "options": [
            {"label": "1 day — minimal", "value": "1"},
            {"label": "7 days", "value": "7"},
            {"label": "14 days", "value": "14"},
        ],
        "recommended_index": 1,
    },
]


def microservice_config_questions() -> list[dict]:
    """Fixed MCQ set (size / scaling / DB size / log retention / backups) for the
    canonical microservice — deterministic, no LLM call. Returns fresh copies."""
    return [{**q, "options": [dict(o) for o in q["options"]]} for q in _MICROSERVICE_QUESTIONS]


def _set_var_default(vt: str, varname: str, literal: str) -> str:
    """Set the `default = <literal>` inside `variable "varname" { ... }`."""
    m = re.search(rf'variable\s+"{varname}"\s*\{{', vt)
    if not m:
        return vt
    brace = vt.index("{", m.start())
    depth, end = 0, brace
    for j in range(brace, len(vt)):
        if vt[j] == "{":
            depth += 1
        elif vt[j] == "}":
            depth -= 1
            if depth == 0:
                end = j
                break
    body = vt[brace + 1 : end]
    if re.search(r"(^|\n)\s*default\s*=", body):
        body = re.sub(r"default\s*=\s*[^\n]+", f"default = {literal}", body, count=1)
    else:
        body = body.rstrip() + f"\n  default = {literal}\n"
    return vt[: brace + 1] + body + vt[end:]


def apply_microservice_config_answers(files: dict, answers: dict) -> dict:
    """Patch canonical template variable defaults from MCQ answers.
    `answers` is {question_id: selected_option_index}."""
    vt = files.get("variables.tf")
    if not vt:
        return files
    by_id = {q["id"]: q for q in _MICROSERVICE_QUESTIONS}
    for qid, idx in (answers or {}).items():
        q = by_id.get(qid)
        if not q:
            continue
        try:
            value = q["options"][int(idx)]["value"]
        except (IndexError, ValueError, TypeError):
            continue
        if qid == "config:ecs_size":
            cpu, _, mem = value.partition("/")
            vt = _set_var_default(vt, "ecs_cpu", cpu)
            vt = _set_var_default(vt, "ecs_memory", mem)
        elif qid == "config:ecs_desired_count":
            vt = _set_var_default(vt, "ecs_desired_count", value)
        elif qid == "config:aurora_instance_class":
            vt = _set_var_default(vt, "aurora_instance_class", f'"{value}"')
        elif qid == "config:log_retention_days":
            vt = _set_var_default(vt, "log_retention_days", value)
        elif qid == "config:backup_retention_period":
            vt = _set_var_default(vt, "backup_retention_period", value)
    return {**files, "variables.tf": vt}
