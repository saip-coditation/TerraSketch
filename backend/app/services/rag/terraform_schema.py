"""RAG over the Terraform provider registry JSON schema.

Fetches the provider schema for resources that were identified in the DiagramIR,
then injects the relevant attribute definitions into the Plan node's context so
the model uses real, current resource arguments instead of hallucinating deprecated ones.

Usage (from Plan node):
    from app.services.rag.terraform_schema import fetch_resource_schema
    schema = await fetch_resource_schema("aws_ecs_service")
    # inject into plan context via ContextBuilder.add_retrieved(RetrievedContext(...))

Implementation status: stub. The Terraform registry schema API endpoint is:
    https://registry.terraform.io/v2/provider-versions/{namespace}/{type}/{version}/schemas/{resource}
Full implementation depends on caching strategy and provider version pinning.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SCHEMA_CACHE: dict[str, dict] = {}


async def fetch_resource_schema(terraform_type: str) -> dict:
    """Return the Terraform schema for a resource type.

    Returns an empty dict when unavailable (graceful degradation).
    Expected shape: {"attributes": {"<name>": {"type": ..., "description": ...}}, ...}
    """
    if terraform_type in _SCHEMA_CACHE:
        return _SCHEMA_CACHE[terraform_type]

    # Parse provider namespace from type (e.g. "aws_ecs_service" → "hashicorp/aws")
    parts = terraform_type.split("_", 1)
    if len(parts) < 2:
        return {}

    provider_prefix = parts[0]
    namespace_map = {"aws": "hashicorp/aws", "azurerm": "hashicorp/azurerm", "google": "hashicorp/google"}
    namespace = namespace_map.get(provider_prefix)
    if not namespace:
        return {}

    try:
        import httpx
        url = f"https://registry.terraform.io/v2/providers/{namespace}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return {}
        # Full schema endpoint requires provider version — simplified stub
        logger.debug("Terraform registry schema fetch for %s: OK", terraform_type)
        return {}
    except Exception as exc:
        logger.debug("Terraform schema fetch failed for %s: %s", terraform_type, exc)
        return {}


async def get_schemas_for_plan(terraform_types: list[str]) -> dict[str, dict]:
    """Fetch schemas for multiple resource types. Returns {type: schema}."""
    import asyncio
    results = await asyncio.gather(*[fetch_resource_schema(t) for t in terraform_types])
    return {t: s for t, s in zip(terraform_types, results) if s}
