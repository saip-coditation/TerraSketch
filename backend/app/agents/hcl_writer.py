"""Deterministic HCL emitter — Python-based Terraform writer.

Takes a ResourcePlan and generates valid HCL without any LLM call.
Eliminates the class of bugs that parser.py, postprocess.py, and
canonical-override exist to mask (§4 P2 — deterministic HCL emitter).

Architecture:
  LLM picks resource types + relationships (Plan node).
  This module writes HCL deterministically given that plan.

Enable by setting SYNTHESIZE_MODE=deterministic in .env.
Falls back to LLM synthesis when a resource type is unknown.
"""

from __future__ import annotations

import json
import re
import textwrap
from typing import Any

from app.agents.state import PlannedResource, ResourcePlan, TerraformFiles

# ── Provider version pins ────────────────────────────────────────────────────

_PROVIDER_VERSIONS = {
    "aws": ('hashicorp/aws', '~> 5.0'),
    "azurerm": ('hashicorp/azurerm', '~> 3.0'),
    "google": ('hashicorp/google', '~> 5.0'),
}

_CLOUD_TO_PROVIDER = {
    "aws": "aws",
    "azure": "azurerm",
    "gcp": "google",
}

# ── HCL helpers ──────────────────────────────────────────────────────────────

def _hcl_value(v: Any, indent: int = 2) -> str:
    """Convert a Python value to HCL literal."""
    pad = " " * indent
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        if "\n" in v:
            return f'<<-EOT\n{v}\nEOT'
        return f'"{v}"'
    if isinstance(v, list):
        if not v:
            return "[]"
        items = ", ".join(_hcl_value(i) for i in v)
        return f"[{items}]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        lines = ["{"]
        for k, dv in v.items():
            lines.append(f"{pad}  {k} = {_hcl_value(dv, indent + 2)}")
        lines.append(f"{pad}}}")
        return "\n".join(lines)
    return f'"{v}"'


def _block(resource_type: str, local_id: str, body: dict[str, Any], comment: str = "") -> str:
    lines = []
    if comment:
        lines.append(f"# {comment}")
    lines.append(f'# plan_local_id: {local_id}')
    lines.append(f'resource "{resource_type}" "{local_id}" {{')
    for k, v in body.items():
        if isinstance(v, dict):
            lines.append(f"  {k} {{")
            for kk, vv in v.items():
                lines.append(f"    {kk} = {_hcl_value(vv)}")
            lines.append("  }")
        else:
            lines.append(f"  {k} = {_hcl_value(v)}")
    lines.append("}")
    return "\n".join(lines)


def _var_ref(name: str) -> str:
    return f"var.{name}"


def _res_ref(rtype: str, rid: str, attr: str) -> str:
    return f"{rtype}.{rid}.{attr}"


# ── Resource body builders per Terraform type ────────────────────────────────

def _build_aws_vpc(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [
        ("vpc_cidr", "string", "10.0.0.0/16", "VPC CIDR block"),
    ]
    body = {
        "cidr_block": _var_ref("vpc_cidr"),
        "enable_dns_support": True,
        "enable_dns_hostnames": True,
        "tags": {"Name": f"${{var.name_prefix}}-vpc"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_subnet(r: PlannedResource) -> tuple[dict, list[tuple]]:
    is_public = "public" in r.local_id or "public" in r.purpose.lower()
    cidr_var = f"{r.local_id}_cidr"
    vars_ = [(cidr_var, "string", "10.0.1.0/24", f"CIDR for {r.local_id}")]
    body = {
        "vpc_id": _var_ref("vpc_id"),
        "cidr_block": _var_ref(cidr_var),
        "map_public_ip_on_launch": is_public,
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_security_group(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "description": r.purpose,
        "vpc_id": _var_ref("vpc_id"),
        "egress": [{"from_port": 0, "to_port": 0, "protocol": "-1", "cidr_blocks": ["0.0.0.0/0"]}],
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, []


def _build_aws_instance(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [
        ("instance_type", "string", "t3.micro", "EC2 instance type"),
        ("ami_id", "string", "ami-0c55b159cbfafe1f0", "AMI ID"),
    ]
    body = {
        "ami": _var_ref("ami_id"),
        "instance_type": _var_ref("instance_type"),
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_lb(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "internal": False,
        "load_balancer_type": "application",
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, []


def _build_aws_lb_target_group(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "port": r.args.get("port", 80),
        "protocol": "HTTP",
        "vpc_id": _var_ref("vpc_id"),
        "target_type": "ip",
    }
    body.update(r.args)
    return body, []


def _build_aws_lb_listener(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "port": r.args.get("port", 80),
        "protocol": "HTTP",
        "default_action": {"type": "forward"},
    }
    body.update(r.args)
    return body, []


def _build_aws_ecs_cluster(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    return body, []


def _build_aws_ecs_task_definition(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [
        ("container_image", "string", "nginx:latest", "Container image"),
        ("task_cpu", "string", "256", "Task CPU units"),
        ("task_memory", "string", "512", "Task memory (MB)"),
    ]
    body = {
        "family": f"${{var.name_prefix}}-{r.local_id}",
        "cpu": _var_ref("task_cpu"),
        "memory": _var_ref("task_memory"),
        "network_mode": "awsvpc",
        "requires_compatibilities": ["FARGATE"],
        "container_definitions": (
            f'jsonencode([{{\n'
            f'  name  = "{r.local_id}"\n'
            f'  image = var.container_image\n'
            f'  portMappings = [{{ containerPort = 80 }}]\n'
            f'}}])'
        ),
    }
    body.update(r.args)
    return body, vars_


def _build_aws_ecs_service(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("desired_count", "number", 2, "Number of ECS tasks")]
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "launch_type": "FARGATE",
        "desired_count": _var_ref("desired_count"),
    }
    body.update(r.args)
    return body, vars_


def _build_aws_db_instance(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [
        ("db_instance_class", "string", "db.t3.micro", "RDS instance class"),
        ("db_name", "string", "appdb", "Database name"),
        ("db_username", "string", "admin", "Database username"),
        ("db_password", "string", "", "Database password (sensitive)"),
        ("db_allocated_storage", "number", 20, "Allocated storage (GB)"),
    ]
    body = {
        "identifier": f"${{var.name_prefix}}-{r.local_id}",
        "engine": r.args.get("engine", "mysql"),
        "engine_version": r.args.get("engine_version", "8.0"),
        "instance_class": _var_ref("db_instance_class"),
        "allocated_storage": _var_ref("db_allocated_storage"),
        "db_name": _var_ref("db_name"),
        "username": _var_ref("db_username"),
        "password": _var_ref("db_password"),
        "skip_final_snapshot": True,
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_rds_cluster(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [
        ("db_master_username", "string", "admin", "Aurora master username"),
        ("db_master_password", "string", "", "Aurora master password (sensitive)"),
        ("db_cluster_name", "string", "appdb", "Aurora database name"),
    ]
    body = {
        "cluster_identifier": f"${{var.name_prefix}}-{r.local_id}",
        "engine": r.args.get("engine", "aurora-mysql"),
        "engine_version": r.args.get("engine_version", "8.0.mysql_aurora.3.04.0"),
        "database_name": _var_ref("db_cluster_name"),
        "master_username": _var_ref("db_master_username"),
        "master_password": _var_ref("db_master_password"),
        "skip_final_snapshot": True,
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_s3_bucket(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("s3_bucket_name", "string", "", "S3 bucket name (must be globally unique)")]
    body = {
        "bucket": _var_ref("s3_bucket_name"),
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_cloudfront_distribution(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "enabled": True,
        "default_cache_behavior": {
            "viewer_protocol_policy": "redirect-to-https",
            "allowed_methods": ["GET", "HEAD"],
            "cached_methods": ["GET", "HEAD"],
            "target_origin_id": "default",
            "forwarded_values": {"query_string": False, "cookies": {"forward": "none"}},
        },
        "restrictions": {"geo_restriction": {"restriction_type": "none"}},
        "viewer_certificate": {"cloudfront_default_certificate": True},
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, []


def _build_aws_elasticache_cluster(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("cache_node_type", "string", "cache.t3.micro", "ElastiCache node type")]
    body = {
        "cluster_id": f"${{var.name_prefix}}-{r.local_id}",
        "engine": r.args.get("engine", "redis"),
        "node_type": _var_ref("cache_node_type"),
        "num_cache_nodes": 1,
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, vars_


def _build_aws_iam_role(r: PlannedResource) -> tuple[dict, list[tuple]]:
    service = r.args.get("service", "ec2.amazonaws.com")
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "assume_role_policy": (
            f'jsonencode({{\n'
            f'  Version = "2012-10-17"\n'
            f'  Statement = [{{\n'
            f'    Action = "sts:AssumeRole"\n'
            f'    Effect = "Allow"\n'
            f'    Principal = {{ Service = "{service}" }}\n'
            f'  }}]\n'
            f'}})'
        ),
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    return body, []


def _build_aws_lambda_function(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("lambda_runtime", "string", "python3.12", "Lambda runtime")]
    body = {
        "function_name": f"${{var.name_prefix}}-{r.local_id}",
        "runtime": _var_ref("lambda_runtime"),
        "handler": r.args.get("handler", "index.handler"),
        "filename": r.args.get("filename", "function.zip"),
    }
    body.update(r.args)
    return body, vars_


def _build_aws_internet_gateway(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "vpc_id": _var_ref("vpc_id"),
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    return body, []


def _build_aws_route_table(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "vpc_id": _var_ref("vpc_id"),
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    return body, []


def _build_azurerm_resource_group(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("location", "string", "East US", "Azure region")]
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}-rg",
        "location": _var_ref("location"),
        "tags": {"Environment": "${{var.environment}}"},
    }
    body.update(r.args)
    return body, vars_


def _build_azurerm_virtual_network(r: PlannedResource) -> tuple[dict, list[tuple]]:
    body = {
        "name": f"${{var.name_prefix}}-vnet",
        "address_space": ["10.0.0.0/16"],
        "location": _var_ref("location"),
        "resource_group_name": _var_ref("resource_group_name"),
        "tags": {"Name": f"${{var.name_prefix}}-{r.local_id}"},
    }
    body.update(r.args)
    return body, [("resource_group_name", "string", "", "Resource group name")]


def _build_google_compute_instance(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [
        ("machine_type", "string", "e2-medium", "GCE machine type"),
        ("zone", "string", "us-central1-a", "GCE zone"),
    ]
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "machine_type": _var_ref("machine_type"),
        "zone": _var_ref("zone"),
        "boot_disk": {"initialize_params": {"image": "debian-cloud/debian-11"}},
        "network_interface": [{"network": "default", "access_config": {}}],
    }
    body.update(r.args)
    return body, vars_


def _build_google_storage_bucket(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("gcs_bucket_name", "string", "", "GCS bucket name (globally unique)")]
    body = {
        "name": _var_ref("gcs_bucket_name"),
        "location": _var_ref("region"),
        "force_destroy": True,
    }
    body.update(r.args)
    return body, vars_


def _build_google_sql_database_instance(r: PlannedResource) -> tuple[dict, list[tuple]]:
    vars_ = [("db_tier", "string", "db-f1-micro", "Cloud SQL tier")]
    body = {
        "name": f"${{var.name_prefix}}-{r.local_id}",
        "database_version": r.args.get("database_version", "MYSQL_8_0"),
        "region": _var_ref("region"),
        "settings": {"tier": _var_ref("db_tier"), "ip_configuration": {"ipv4_enabled": True}},
    }
    body.update(r.args)
    return body, vars_


# ── Dispatch table ───────────────────────────────────────────────────────────

_BUILDERS: dict[str, Any] = {
    "aws_vpc": _build_aws_vpc,
    "aws_subnet": _build_aws_subnet,
    "aws_security_group": _build_aws_security_group,
    "aws_instance": _build_aws_instance,
    "aws_lb": _build_aws_lb,
    "aws_alb": _build_aws_lb,
    "aws_lb_target_group": _build_aws_lb_target_group,
    "aws_lb_listener": _build_aws_lb_listener,
    "aws_ecs_cluster": _build_aws_ecs_cluster,
    "aws_ecs_task_definition": _build_aws_ecs_task_definition,
    "aws_ecs_service": _build_aws_ecs_service,
    "aws_db_instance": _build_aws_db_instance,
    "aws_rds_cluster": _build_aws_rds_cluster,
    "aws_s3_bucket": _build_aws_s3_bucket,
    "aws_cloudfront_distribution": _build_aws_cloudfront_distribution,
    "aws_elasticache_cluster": _build_aws_elasticache_cluster,
    "aws_elasticache_replication_group": _build_aws_elasticache_cluster,
    "aws_iam_role": _build_aws_iam_role,
    "aws_lambda_function": _build_aws_lambda_function,
    "aws_internet_gateway": _build_aws_internet_gateway,
    "aws_route_table": _build_aws_route_table,
    "azurerm_resource_group": _build_azurerm_resource_group,
    "azurerm_virtual_network": _build_azurerm_virtual_network,
    "google_compute_instance": _build_google_compute_instance,
    "google_storage_bucket": _build_google_storage_bucket,
    "google_sql_database_instance": _build_google_sql_database_instance,
}


# ── Main emitter ─────────────────────────────────────────────────────────────

def emit_terraform(plan: ResourcePlan, environment: str = "dev") -> TerraformFiles:
    """Deterministically generate four Terraform files from a ResourcePlan.

    Returns None for unknown resource types that need LLM synthesis fallback.
    """
    provider_key = _CLOUD_TO_PROVIDER.get(plan.cloud_provider, plan.cloud_provider)
    provider_name, provider_version = _PROVIDER_VERSIONS.get(provider_key, (provider_key, "~> 1.0"))

    main_blocks: list[str] = []
    all_vars: dict[str, tuple[str, Any, str]] = {}  # name → (type, default, desc)
    unknown_types: list[str] = []

    # Common variables every stack needs
    all_vars["name_prefix"] = ("string", f"terrasketch-{environment}", "Name prefix for all resources")
    all_vars["environment"] = ("string", environment, "Deployment environment")
    if plan.cloud_provider == "aws":
        all_vars["region"] = ("string", "us-east-1", "AWS region")
        all_vars["vpc_id"] = ("string", "", "VPC ID (set in terraform.tfvars)")
    elif plan.cloud_provider == "azure":
        all_vars["location"] = ("string", "East US", "Azure region")
    elif plan.cloud_provider == "gcp":
        all_vars["project_id"] = ("string", "", "GCP project ID")
        all_vars["region"] = ("string", "us-central1", "GCP region")

    for resource in plan.resources:
        builder = _BUILDERS.get(resource.terraform_type)
        if builder is None:
            unknown_types.append(resource.terraform_type)
            main_blocks.append(
                f"# TODO: {resource.terraform_type} {resource.local_id} — unknown type, manual HCL required\n"
                f"# purpose: {resource.purpose}"
            )
            continue

        body, extra_vars = builder(resource)
        for vname, vtype, vdefault, vdesc in extra_vars:
            if vname not in all_vars:
                all_vars[vname] = (vtype, vdefault, vdesc)

        block = _block(resource.terraform_type, resource.local_id, body, resource.purpose)
        main_blocks.append(block)

    # Build main.tf
    header = (
        f"# Generated by TerraSketch deterministic HCL emitter\n"
        f"# Cloud: {plan.cloud_provider} | Environment: {environment}\n"
    )
    if unknown_types:
        header += f"# WARNING: Unknown resource types (LLM synthesis needed): {', '.join(unknown_types)}\n"
    main_tf = header + "\n\n" + "\n\n".join(main_blocks)

    # Build variables.tf
    var_blocks: list[str] = []
    for vname, (vtype, vdefault, vdesc) in all_vars.items():
        lines = [f'variable "{vname}" {{']
        lines.append(f'  description = "{vdesc}"')
        lines.append(f'  type        = {vtype}')
        if vdefault != "" or vtype == "bool":
            lines.append(f'  default     = {_hcl_value(vdefault)}')
        if "password" in vname or "secret" in vname:
            lines.append('  sensitive   = true')
        lines.append("}")
        var_blocks.append("\n".join(lines))
    variables_tf = "\n\n".join(var_blocks)

    # Build outputs.tf
    output_blocks: list[str] = []
    for resource in plan.resources:
        if resource.terraform_type in _BUILDERS:
            attr = "id"
            if "lb" in resource.terraform_type:
                attr = "dns_name"
            elif "s3" in resource.terraform_type:
                attr = "bucket"
            elif "cloudfront" in resource.terraform_type:
                attr = "domain_name"
            output_blocks.append(
                f'output "{resource.local_id}_{attr}" {{\n'
                f'  description = "{resource.purpose}"\n'
                f'  value       = {resource.terraform_type}.{resource.local_id}.{attr}\n'
                f'}}'
            )
    outputs_tf = "\n\n".join(output_blocks) or '# No outputs defined'

    # Build providers.tf
    if plan.cloud_provider == "aws":
        providers_tf = (
            f'terraform {{\n'
            f'  required_version = ">= 1.5.0"\n'
            f'  required_providers {{\n'
            f'    {provider_key} = {{\n'
            f'      source  = "{provider_name}"\n'
            f'      version = "{provider_version}"\n'
            f'    }}\n'
            f'  }}\n'
            f'}}\n\n'
            f'provider "{provider_key}" {{\n'
            f'  region = var.region\n'
            f'}}\n'
        )
    elif plan.cloud_provider == "azure":
        providers_tf = (
            f'terraform {{\n'
            f'  required_version = ">= 1.5.0"\n'
            f'  required_providers {{\n'
            f'    {provider_key} = {{\n'
            f'      source  = "{provider_name}"\n'
            f'      version = "{provider_version}"\n'
            f'    }}\n'
            f'  }}\n'
            f'}}\n\n'
            f'provider "{provider_key}" {{\n'
            f'  features {{}}\n'
            f'}}\n'
        )
    else:
        providers_tf = (
            f'terraform {{\n'
            f'  required_version = ">= 1.5.0"\n'
            f'  required_providers {{\n'
            f'    {provider_key} = {{\n'
            f'      source  = "{provider_name}"\n'
            f'      version = "{provider_version}"\n'
            f'    }}\n'
            f'  }}\n'
            f'}}\n\n'
            f'provider "{provider_key}" {{\n'
            f'  project = var.project_id\n'
            f'  region  = var.region\n'
            f'}}\n'
        )

    return TerraformFiles(**{
        "main.tf": main_tf,
        "variables.tf": variables_tf,
        "outputs.tf": outputs_tf,
        "providers.tf": providers_tf,
    })


def can_emit_deterministically(plan: ResourcePlan) -> tuple[bool, list[str]]:
    """Return (can_fully_emit, unknown_types). Partial emit is always possible."""
    unknown = [r.terraform_type for r in plan.resources if r.terraform_type not in _BUILDERS]
    return len(unknown) == 0, unknown
