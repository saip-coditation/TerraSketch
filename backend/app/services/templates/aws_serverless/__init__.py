"""Canonical AWS serverless template loader.

Pattern matched:
  API Gateway (HTTP) -> Lambda -> DynamoDB

Applied after the LLM pass when the identified resources match this set, so the
output is a vetted, deployable serverless stack (with a live HTTP endpoint)
instead of relying on the model to wire Lambda packaging/permissions correctly.
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


def should_apply_canonical_serverless(
    *,
    cloud_provider: str,
    resources_identified: list[str],
    main_tf: str,
) -> bool:
    if cloud_provider.lower().strip() != "aws":
        return False
    blob = _resource_blob(resources_identified, main_tf)
    need = [
        re.search(r"\blambda\b|aws_lambda|function", blob),
        re.search(r"api\s*gateway|apigateway|aws_apigatewayv2|rest\s*api|http\s*api", blob),
        re.search(r"dynamodb|dynamo\s*db", blob),
    ]
    if not all(m is not None for m in need):
        return False
    # Don't hijack the container/microservice pattern — those are ECS/Aurora based.
    if re.search(r"\becs\b|fargate|aurora|elasticache|\balb\b|application\s*load", blob):
        return False
    return True


def get_canonical_serverless_files(*, environment: str) -> dict[str, str]:
    env_slug = re.sub(r"[^a-z0-9-]", "-", environment.lower().strip()) or "dev"
    defaults_comment = (
        f"# Suggested terraform.tfvars starter (all optional — sensible defaults baked in):\n"
        f"# The stack is self-contained: the Lambda ships an inline handler, so a\n"
        f"# plain `terraform apply` gives you a live API endpoint.\n"
        f'# region = "us-east-1"\n'
        f'# name_prefix = "terrasketch-{env_slug}"\n'
    )
    variables = defaults_comment + "\n" + _load("variables.tf")
    return {
        "main.tf": _load("main.tf"),
        "variables.tf": variables,
        "outputs.tf": _load("outputs.tf"),
        "providers.tf": _load("providers.tf"),
    }


def maybe_replace_with_canonical_serverless(
    *,
    files: dict[str, str],
    cloud_provider: str,
    resources_identified: list[str],
    environment: str,
) -> tuple[dict[str, str], list[str]]:
    """If the diagram matches API Gateway + Lambda + DynamoDB, replace files with
    the canonical serverless template."""
    import logging

    _log = logging.getLogger(__name__)

    main = files.get("main.tf", "")
    if not should_apply_canonical_serverless(
        cloud_provider=cloud_provider,
        resources_identified=resources_identified,
        main_tf=main,
    ):
        return files, []

    _log.info("Canonical AWS serverless override applied (provider=%s).", cloud_provider)

    canonical = get_canonical_serverless_files(environment=environment)
    notes = [
        "[CANONICAL_OVERRIDE] Your diagram matched the serverless pattern "
        "(API Gateway + Lambda + DynamoDB). The LLM output was replaced with a "
        "validated, self-contained template that deploys a live HTTP endpoint.",
        "Everything has a sensible default; edit terraform.tfvars only to customize "
        "name_prefix, Lambda size, or DynamoDB billing.",
    ]
    return canonical, notes


def canonical_serverless_resources_list() -> list[str]:
    return [
        "Amazon API Gateway",
        "AWS Lambda",
        "Amazon DynamoDB",
    ]
