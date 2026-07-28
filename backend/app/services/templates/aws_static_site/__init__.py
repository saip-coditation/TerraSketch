"""Canonical AWS static-site template loader.

Pattern matched:
  S3 (private) + CloudFront (HTTPS, OAC)  — a static website, nothing else.

Applied when the diagram is just an S3 bucket behind CloudFront, so the output is
a vetted, deployable static site (with a default index.html) rather than a
hand-rolled bucket/CDN wiring the model might get wrong (public ACLs, no OAC…).
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


def should_apply_canonical_static_site(
    *,
    cloud_provider: str,
    resources_identified: list[str],
    main_tf: str,
) -> bool:
    if cloud_provider.lower().strip() != "aws":
        return False
    blob = _resource_blob(resources_identified, main_tf)
    need = [
        re.search(r"\bs3\b|simple\s*storage|storage\s*bucket|aws_s3", blob),
        re.search(r"cloud\s*front|cloudfront|\bcdn\b", blob),
    ]
    if not all(m is not None for m in need):
        return False
    # A *pure* static site — bail if compute/data/api services are present.
    if re.search(
        r"\becs\b|fargate|\balb\b|application\s*load|lambda|function|api\s*gateway|apigateway|"
        r"aurora|\brds\b|dynamodb|elasticache|redis|\bec2\b|instance|\bvpc\b",
        blob,
    ):
        return False
    return True


def get_canonical_static_site_files(*, environment: str) -> dict[str, str]:
    env_slug = re.sub(r"[^a-z0-9-]", "-", environment.lower().strip()) or "dev"
    defaults_comment = (
        f"# Suggested terraform.tfvars starter (all optional):\n"
        f"# The site ships a default index.html, so a plain apply gives a live HTTPS URL.\n"
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


def maybe_replace_with_canonical_static_site(
    *,
    files: dict[str, str],
    cloud_provider: str,
    resources_identified: list[str],
    environment: str,
) -> tuple[dict[str, str], list[str]]:
    """If the diagram is just S3 + CloudFront, replace files with the canonical
    static-site template."""
    import logging

    _log = logging.getLogger(__name__)

    main = files.get("main.tf", "")
    if not should_apply_canonical_static_site(
        cloud_provider=cloud_provider,
        resources_identified=resources_identified,
        main_tf=main,
    ):
        return files, []

    _log.info("Canonical AWS static-site override applied (provider=%s).", cloud_provider)

    canonical = get_canonical_static_site_files(environment=environment)
    notes = [
        "[CANONICAL_OVERRIDE] Your diagram matched the static-site pattern "
        "(S3 + CloudFront). The LLM output was replaced with a validated template: "
        "a private S3 bucket (OAC) behind CloudFront over HTTPS, shipping a default "
        "index.html so the CloudFront URL serves a page immediately.",
        "Upload your own build to the bucket to replace the placeholder page.",
    ]
    return canonical, notes


def canonical_static_site_resources_list() -> list[str]:
    return [
        "Amazon S3",
        "Amazon CloudFront",
    ]
