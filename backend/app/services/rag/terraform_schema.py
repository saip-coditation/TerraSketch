"""RAG over the Terraform provider registry JSON schema.

Fetches provider schema for resource types identified in the DiagramIR
and injects relevant attribute definitions into the Plan node context,
so the model uses real, current resource arguments instead of hallucinating
deprecated ones.

Caching: schemas are cached to disk at ~/.cache/terrasketch/tf_schemas/
so repeated runs don't re-fetch from the registry.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Disk cache directory
_CACHE_DIR = Path(os.environ.get("TF_SCHEMA_CACHE_DIR", Path.home() / ".cache" / "terrasketch" / "tf_schemas"))
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# In-memory cache (process lifetime)
_MEM_CACHE: dict[str, dict[str, Any]] = {}

# Map node kind prefix → Terraform provider namespace
_PROVIDER_MAP = {
    "aws": "hashicorp/aws",
    "azurerm": "hashicorp/azurerm",
    "azure": "hashicorp/azurerm",
    "google": "hashicorp/google",
    "gcp": "hashicorp/google",
}

# Known resource type → brief schema (hardcoded fallback so the system
# works offline and for common resources without a registry hit)
_BUILTIN_SCHEMAS: dict[str, dict[str, Any]] = {
    "aws_vpc": {"attributes": {"cidr_block": "string", "enable_dns_support": "bool", "enable_dns_hostnames": "bool", "tags": "map(string)"}},
    "aws_subnet": {"attributes": {"vpc_id": "string", "cidr_block": "string", "availability_zone": "string", "map_public_ip_on_launch": "bool"}},
    "aws_security_group": {"attributes": {"vpc_id": "string", "name": "string", "description": "string", "ingress": "list", "egress": "list"}},
    "aws_instance": {"attributes": {"ami": "string", "instance_type": "string", "subnet_id": "string", "vpc_security_group_ids": "list(string)", "iam_instance_profile": "string"}},
    "aws_lb": {"attributes": {"name": "string", "internal": "bool", "load_balancer_type": "string", "security_groups": "list(string)", "subnets": "list(string)"}},
    "aws_lb_listener": {"attributes": {"load_balancer_arn": "string", "port": "number", "protocol": "string", "default_action": "object"}},
    "aws_lb_target_group": {"attributes": {"name": "string", "port": "number", "protocol": "string", "vpc_id": "string", "target_type": "string"}},
    "aws_ecs_cluster": {"attributes": {"name": "string", "tags": "map(string)"}},
    "aws_ecs_task_definition": {"attributes": {"family": "string", "cpu": "string", "memory": "string", "network_mode": "string", "requires_compatibilities": "list(string)", "execution_role_arn": "string", "container_definitions": "string"}},
    "aws_ecs_service": {"attributes": {"name": "string", "cluster": "string", "task_definition": "string", "desired_count": "number", "launch_type": "string", "network_configuration": "object", "load_balancer": "list"}},
    "aws_rds_cluster": {"attributes": {"cluster_identifier": "string", "engine": "string", "engine_version": "string", "database_name": "string", "master_username": "string", "master_password": "string", "db_subnet_group_name": "string", "vpc_security_group_ids": "list(string)"}},
    "aws_db_instance": {"attributes": {"identifier": "string", "engine": "string", "instance_class": "string", "allocated_storage": "number", "username": "string", "password": "string", "db_subnet_group_name": "string", "vpc_security_group_ids": "list(string)", "skip_final_snapshot": "bool"}},
    "aws_s3_bucket": {"attributes": {"bucket": "string", "tags": "map(string)"}},
    "aws_cloudfront_distribution": {"attributes": {"enabled": "bool", "origin": "list", "default_cache_behavior": "object", "restrictions": "object", "viewer_certificate": "object"}},
    "aws_elasticache_cluster": {"attributes": {"cluster_id": "string", "engine": "string", "node_type": "string", "num_cache_nodes": "number", "subnet_group_name": "string", "security_group_ids": "list(string)"}},
    "aws_iam_role": {"attributes": {"name": "string", "assume_role_policy": "string", "tags": "map(string)"}},
    "aws_lambda_function": {"attributes": {"function_name": "string", "runtime": "string", "handler": "string", "role": "string", "filename": "string", "source_code_hash": "string"}},
    "aws_api_gateway_rest_api": {"attributes": {"name": "string", "description": "string"}},
    "azurerm_resource_group": {"attributes": {"name": "string", "location": "string"}},
    "azurerm_virtual_network": {"attributes": {"name": "string", "resource_group_name": "string", "location": "string", "address_space": "list(string)"}},
    "azurerm_subnet": {"attributes": {"name": "string", "resource_group_name": "string", "virtual_network_name": "string", "address_prefixes": "list(string)"}},
    "azurerm_linux_virtual_machine": {"attributes": {"name": "string", "resource_group_name": "string", "location": "string", "size": "string", "admin_username": "string", "network_interface_ids": "list(string)"}},
    "google_compute_instance": {"attributes": {"name": "string", "machine_type": "string", "zone": "string", "boot_disk": "object", "network_interface": "list"}},
    "google_container_cluster": {"attributes": {"name": "string", "location": "string", "initial_node_count": "number", "node_config": "object"}},
    "google_sql_database_instance": {"attributes": {"name": "string", "database_version": "string", "region": "string", "settings": "object"}},
    "google_storage_bucket": {"attributes": {"name": "string", "location": "string", "force_destroy": "bool"}},
    "google_cloud_run_service": {"attributes": {"name": "string", "location": "string", "template": "object"}},
}


def _cache_path(terraform_type: str) -> Path:
    key = hashlib.md5(terraform_type.encode()).hexdigest()[:12]
    return _CACHE_DIR / f"{terraform_type.replace('/', '_')}_{key}.json"


def _load_from_disk(terraform_type: str) -> dict[str, Any] | None:
    p = _cache_path(terraform_type)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return None


def _save_to_disk(terraform_type: str, schema: dict[str, Any]) -> None:
    try:
        _cache_path(terraform_type).write_text(json.dumps(schema))
    except Exception:
        pass


async def fetch_resource_schema(terraform_type: str) -> dict[str, Any]:
    """Return the Terraform schema for a resource type.

    Resolution order:
    1. In-memory cache (process lifetime)
    2. Disk cache (~/.cache/terrasketch/tf_schemas/)
    3. Built-in hardcoded schema (offline-safe for common resources)
    4. Terraform registry API (live fetch, cached to disk on success)
    """
    if terraform_type in _MEM_CACHE:
        return _MEM_CACHE[terraform_type]

    # Built-in schema (fastest, no network)
    if terraform_type in _BUILTIN_SCHEMAS:
        schema = _BUILTIN_SCHEMAS[terraform_type]
        _MEM_CACHE[terraform_type] = schema
        return schema

    # Disk cache
    cached = _load_from_disk(terraform_type)
    if cached is not None:
        _MEM_CACHE[terraform_type] = cached
        return cached

    # Live fetch from Terraform registry
    parts = terraform_type.split("_", 1)
    provider_prefix = parts[0]
    namespace = _PROVIDER_MAP.get(provider_prefix)
    if not namespace:
        return {}

    try:
        url = f"https://registry.terraform.io/v1/providers/{namespace}/versions"
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
        if resp.status_code != 200:
            return {}

        data = resp.json()
        versions = data.get("versions", [])
        if not versions:
            return {}

        latest = versions[0].get("version", "")
        schema_url = f"https://registry.terraform.io/v1/providers/{namespace}/{latest}/schema"
        async with httpx.AsyncClient(timeout=15.0) as client:
            sresp = await client.get(schema_url, headers={"Accept": "application/json"})
        if sresp.status_code != 200:
            return {}

        full_schema = sresp.json()
        resource_schemas = full_schema.get("schemas", {}).get("provider_schemas", {})
        # Find the resource in the schema
        for _, pschema in resource_schemas.items():
            rt = pschema.get("resource_schemas", {}).get(terraform_type, {})
            if rt:
                schema = {"attributes": {k: str(v.get("type", "")) for k, v in rt.get("block", {}).get("attributes", {}).items()}}
                _MEM_CACHE[terraform_type] = schema
                _save_to_disk(terraform_type, schema)
                return schema
    except Exception as exc:
        logger.debug("Terraform registry fetch failed for %s: %s", terraform_type, exc)

    return {}


async def get_schemas_for_plan(terraform_types: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch schemas for multiple resource type hints from the DiagramIR node kinds.

    Accepts raw kind strings (e.g. 'ecs_fargate', 'rds_mysql') and maps them
    to likely Terraform resource types before fetching.
    """
    import asyncio

    # Map common diagram kinds → Terraform resource types
    _KIND_MAP = {
        "vpc": "aws_vpc",
        "subnet": "aws_subnet",
        "subnet_public": "aws_subnet",
        "subnet_private": "aws_subnet",
        "alb": "aws_lb",
        "elb": "aws_lb",
        "load_balancer": "aws_lb",
        "ecs_fargate": "aws_ecs_service",
        "ecs": "aws_ecs_service",
        "ec2": "aws_instance",
        "ec2_instance": "aws_instance",
        "rds": "aws_db_instance",
        "rds_mysql": "aws_db_instance",
        "rds_postgres": "aws_db_instance",
        "aurora": "aws_rds_cluster",
        "s3": "aws_s3_bucket",
        "s3_bucket": "aws_s3_bucket",
        "cloudfront": "aws_cloudfront_distribution",
        "elasticache": "aws_elasticache_cluster",
        "elasticache_redis": "aws_elasticache_cluster",
        "lambda": "aws_lambda_function",
        "api_gateway": "aws_api_gateway_rest_api",
        "iam": "aws_iam_role",
        "iam_role": "aws_iam_role",
        "security_group": "aws_security_group",
        "vm": "azurerm_linux_virtual_machine",
        "vnet": "azurerm_virtual_network",
        "gce": "google_compute_instance",
        "gke": "google_container_cluster",
        "cloud_run": "google_cloud_run_service",
        "cloud_sql": "google_sql_database_instance",
        "gcs": "google_storage_bucket",
    }

    resolved: dict[str, str] = {}
    for kind in terraform_types:
        tf_type = _KIND_MAP.get(kind.lower())
        if not tf_type and "_" in kind:
            # Already looks like a terraform type (e.g. aws_vpc)
            tf_type = kind.lower()
        if tf_type:
            resolved[kind] = tf_type

    if not resolved:
        return {}

    schemas = await asyncio.gather(*[fetch_resource_schema(t) for t in resolved.values()])
    return {kind: schema for (kind, schema), _tf in zip(
        zip(resolved.keys(), schemas), resolved.values()
    ) if schema}
