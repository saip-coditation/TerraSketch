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
        f"# Suggested terraform.tfvars starter (edit vpc, subnets, bucket, image, db_password):\n"
        f'# region = "us-east-1"\n'
        f'# name_prefix = "terrasketch-{env_slug}"\n'
        f'# vpc_id = "vpc-..."\n'
        f'# public_subnet_ids  = ["subnet-...", "subnet-..."]\n'
        f'# private_subnet_ids = ["subnet-...", "subnet-..."]\n'
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
    """If the diagram matches the 7-component microservice, replace files with canonical."""
    main = files.get("main.tf", "")
    if not should_apply_canonical_microservice(
        cloud_provider=cloud_provider,
        resources_identified=resources_identified,
        main_tf=main,
    ):
        return files, []

    canonical = get_canonical_microservice_files(environment=environment)
    notes = [
        "Canonical AWS microservice template applied so Terraform matches the diagram: "
        "CloudFront with S3 (OAC) + ALB origins, ECS Fargate, ElastiCache, Aurora (cluster+instance), DynamoDB. "
        "Provide vpc_id, subnets, s3_bucket_name, container_image, and db_password via terraform.tfvars."
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
