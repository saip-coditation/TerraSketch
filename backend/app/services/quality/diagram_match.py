"""Heuristic diagram-to-Terraform match analysis.

This is intentionally lightweight and provider-aware enough for practical guidance.
It produces:
1) a percentage estimate of how well generated files match expected architecture pieces
2) actionable advice to improve fidelity when gaps are detected
"""

from __future__ import annotations

import re
from collections.abc import Sequence


def _blob(files: dict[str, str], resources_identified: Sequence[str]) -> str:
    return (
        "\n".join(resources_identified).lower()
        + "\n"
        + files.get("main.tf", "").lower()
        + "\n"
        + files.get("variables.tf", "").lower()
        + "\n"
        + files.get("outputs.tf", "").lower()
        + "\n"
        + files.get("providers.tf", "").lower()
    )


def _aws_simple_web_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        ("VPC", bool(re.search(r'resource\s+"aws_vpc"', text)), "Add a VPC resource."),
        (
            "Internet Gateway",
            bool(re.search(r'resource\s+"aws_internet_gateway"', text)),
            "Add an Internet Gateway and attach it to the VPC.",
        ),
        (
            "Public subnet tier (Multi-AZ)",
            bool(re.search(r'resource\s+"aws_subnet"\s+"public"|public_subnet', text)),
            "Add public subnets across at least two AZs.",
        ),
        (
            "Private web subnet tier (Multi-AZ)",
            bool(re.search(r'resource\s+"aws_subnet"\s+"private_web"|private_web_subnet', text)),
            "Add private web-tier subnets across at least two AZs.",
        ),
        (
            "Private DB subnet tier (Multi-AZ)",
            bool(re.search(r'resource\s+"aws_subnet"\s+"private_db"|private_db_subnet', text)),
            "Add private DB-tier subnets across at least two AZs.",
        ),
        (
            "Public ALB",
            bool(re.search(r'resource\s+"aws_(alb|lb)".*?internal\s*=\s*false', text, re.S)),
            "Add an internet-facing Application Load Balancer in public subnets.",
        ),
        (
            "ALB listener + target group",
            bool(
                re.search(r'resource\s+"aws_lb_listener"', text)
                and re.search(r'resource\s+"aws_lb_target_group"', text)
            ),
            "Wire ALB with listener and target group.",
        ),
        (
            "Two web servers",
            bool(
                re.search(r'resource\s+"aws_instance"\s+"web".*count\s*=\s*2', text, re.S)
                or re.search(r"web server 1|web server 2", text)
            ),
            "Create two web instances in private web subnets.",
        ),
        (
            "EC2 IAM role/profile attached",
            bool(
                re.search(r'resource\s+"aws_iam_role"', text)
                and re.search(r'resource\s+"aws_iam_instance_profile"', text)
                and re.search(r"iam_instance_profile\s*=", text)
            ),
            "Attach an IAM instance profile to the web EC2 instances.",
        ),
        (
            "MySQL in private DB subnets",
            bool(
                re.search(r'resource\s+"aws_db_instance"', text)
                and re.search(r'engine\s*=\s*"mysql"', text)
                and re.search(r'resource\s+"aws_db_subnet_group"', text)
            ),
            "Use RDS MySQL with a DB subnet group in private DB subnets.",
        ),
        (
            "Traffic security path (ALB->Web->DB)",
            bool(
                re.search(r'aws_security_group"\s+"alb"', text)
                and re.search(r'aws_security_group"\s+"web"', text)
                and re.search(r'aws_security_group"\s+"db"', text)
            ),
            "Define SG rules so ALB can reach web tier and web tier can reach DB.",
        ),
        (
            "Public route to IGW",
            bool(
                re.search(r'resource\s+"aws_route_table"', text)
                and re.search(r'resource\s+"aws_route".*gateway_id', text, re.S)
                and re.search(r'resource\s+"aws_route_table_association"', text)
            ),
            "Add route table, default route to IGW, and subnet associations for public subnets.",
        ),
    ]


def _azure_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        (
            "Resource group",
            bool(re.search(r'resource\s+"azurerm_resource_group"', text)),
            "Add azurerm_resource_group as a foundation resource.",
        ),
        (
            "Virtual network",
            bool(re.search(r'resource\s+"azurerm_virtual_network"', text)),
            "Add azurerm_virtual_network and address space.",
        ),
        (
            "Subnets",
            bool(re.search(r'resource\s+"azurerm_subnet"', text)),
            "Add subnets for app and data tiers.",
        ),
        (
            "NSG or rules",
            bool(re.search(r'resource\s+"azurerm_network_security_group"', text)),
            "Add network security groups with least-privilege rules.",
        ),
        (
            "Compute or PaaS",
            bool(
                re.search(
                    r'resource\s+"azurerm_(linux_virtual_machine|windows_virtual_machine|kubernetes_cluster|linux_web_app)"',
                    text,
                )
            ),
            "Add VMs, AKS, or App Service per your diagram.",
        ),
        (
            "Data service",
            bool(
                re.search(
                    r'resource\s+"azurerm_(mysql_flexible_server|postgresql_flexible_server|mssql_server)"',
                    text,
                )
            ),
            "Add a managed database when the diagram shows a data tier.",
        ),
    ]


def _gcp_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        (
            "VPC",
            bool(re.search(r'resource\s+"google_compute_network"', text)),
            "Add google_compute_network.",
        ),
        (
            "Subnets",
            bool(re.search(r'resource\s+"google_compute_subnetwork"', text)),
            "Add regional subnetworks.",
        ),
        (
            "Firewall",
            bool(re.search(r'resource\s+"google_compute_firewall"', text)),
            "Add firewall rules matching your ingress paths.",
        ),
        (
            "Compute or serverless",
            bool(
                re.search(
                    r'resource\s+"google_compute_instance"|resource\s+"google_cloud_run_service"',
                    text,
                )
            ),
            "Add GCE, MIG, or Cloud Run as shown.",
        ),
        (
            "Load balancing",
            bool(re.search(r"google_compute_(forwarding_rule|url_map|backend_service)", text)),
            "Add load balancer resources when the diagram shows a GLB/HTTPS front end.",
        ),
        (
            "Cloud SQL or storage",
            bool(
                re.search(
                    r'resource\s+"google_sql_database_instance"|resource\s+"google_storage_bucket"',
                    text,
                )
            ),
            "Add Cloud SQL or GCS when the diagram includes DB or object storage.",
        ),
    ]


def analyze_diagram_match(
    *,
    cloud_provider: str,
    files: dict[str, str],
    resources_identified: Sequence[str],
) -> tuple[int, list[str]]:
    """Return (match_percent, improvement_advice)."""
    text = _blob(files, resources_identified)
    provider = cloud_provider.lower().strip()

    if provider == "azure":
        rules = _azure_rules(text)
    elif provider == "gcp":
        rules = _gcp_rules(text)
    elif provider == "aws":
        rules = _aws_simple_web_rules(text)
    else:
        has_main = bool(files.get("main.tf", "").strip())
        has_vars = bool(files.get("variables.tf", "").strip())
        has_outputs = bool(files.get("outputs.tf", "").strip())
        has_provider = bool(files.get("providers.tf", "").strip())
        score = int(((has_main + has_vars + has_outputs + has_provider) / 4) * 100)
        advice = []
        if score < 100:
            advice.append(
                "Ensure all required Terraform files are present and complete: "
                "main.tf, variables.tf, outputs.tf, providers.tf."
            )
        return score, advice
    matched = [label for label, ok, _ in rules if ok]
    missing = [(label, tip) for label, ok, tip in rules if not ok]

    percent = int(round((len(matched) / len(rules)) * 100))
    advice = [f"{label}: {tip}" for label, tip in missing[:6]]
    return percent, advice
