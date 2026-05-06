"""Heuristic diagram-to-Terraform match analysis.

Scores how closely generated HCL resembles common reference patterns for each
cloud. Uses every string value in ``files`` (not only the four canonical
names) so content is not missed when keys differ slightly.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence

_CANONICAL = ("main.tf", "variables.tf", "outputs.tf", "providers.tf")
# JSON / Pydantic-style keys occasionally seen in the wild
_KEY_ALIASES = {
    "main_tf": "main.tf",
    "variables_tf": "variables.tf",
    "outputs_tf": "outputs.tf",
    "providers_tf": "providers.tf",
}


def _blob(files: dict[str, str], resources_identified: Sequence[str]) -> str:
    """Lowercased text blob for regex checks — all tf bodies included."""
    parts: list[str] = ["\n".join(resources_identified).lower()]
    by_canon: dict[str, list[str]] = {c: [] for c in _CANONICAL}

    for k, v in files.items():
        if not isinstance(v, str) or not v.strip():
            continue
        target = _KEY_ALIASES.get(k, k)
        if target in by_canon:
            by_canon[target].append(v)
        elif k in _CANONICAL:
            by_canon[k].append(v)
        else:
            parts.append(f"\n# {k}\n{v.lower()}")

    for c in _CANONICAL:
        merged = "\n".join(by_canon[c]) if by_canon[c] else (files.get(c, "") or "")
        if isinstance(merged, str) and merged.strip():
            parts.append(merged.lower())

    return "\n".join(parts)


def _has(text: str, pattern: str, flags: int = 0) -> bool:
    return bool(re.search(pattern, text, flags))


def _has_any(text: str, *patterns: str) -> bool:
    return any(_has(text, p) for p in patterns)


def _has_all(text: str, *patterns: str) -> bool:
    return all(_has(text, p) for p in patterns)


# --- AWS: serverless (no VPC) — separate checklist --------------------------------


def _aws_serverless_http_stack(text: str) -> bool:
    return _has(text, r'resource\s+"aws_lambda_function"') and _has_any(
        text,
        r'resource\s+"aws_apigatewayv2_api"',
        r'resource\s+"aws_api_gateway_rest_api"',
        r'resource\s+"aws_api_gateway_resource"',
    )


def _aws_serverless_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        (
            "Lambda functions",
            _has(text, r'resource\s+"aws_lambda_function"'),
            "Add aws_lambda_function resources for compute.",
        ),
        (
            "API Gateway (REST or HTTP)",
            _has_any(
                text,
                r'resource\s+"aws_apigatewayv2_api"',
                r'resource\s+"aws_api_gateway_rest_api"',
            ),
            "Expose Lambdas via API Gateway HTTP API or REST API.",
        ),
        (
            "Lambda IAM execution role",
            _has_all(text, r'resource\s+"aws_iam_role"', r'resource\s+"aws_lambda_function"')
            and _has(text, r"role\s*=\s*aws_iam_role\.|lambda\.amazonaws\.com"),
            "Attach an IAM role to each Lambda (execution + invocation trust).",
        ),
        (
            "CloudWatch Logs for Lambda",
            _has_any(
                text,
                r'resource\s+"aws_cloudwatch_log_group"',
                r"AmazonCloudWatchLogsFullAccess",
                r"logs:CreateLogGroup",
            ),
            "Ensure Lambda can emit logs (log group or managed policy).",
        ),
        (
            "Integration / routes",
            _has_any(
                text,
                r"aws_apigatewayv2_integration",
                r"aws_api_gateway_integration",
            ),
            "Wire API Gateway routes/integrations to Lambda.",
        ),
        (
            "Data or config (DynamoDB, S3, SSM, or RDS proxy)",
            _has_any(
                text,
                r'resource\s+"aws_dynamodb_table"',
                r'resource\s+"aws_s3_bucket"',
                r'resource\s+"aws_ssm_parameter"',
                r'resource\s+"aws_db_instance"',
                r'resource\s+"aws_rds_cluster"',
            ),
            "Add persistence or configuration resources if the diagram includes data/storage.",
        ),
    ]


# --- AWS: VPC-style reference architecture --------------------------------------


def _aws_vpc_context(text: str) -> bool:
    return _has_any(
        text,
        r'resource\s+"aws_vpc"',
        r'data\s+"aws_vpc"',
        r"vpc_id\s*=\s*var\.vpc_id",
        r"vpc_id\s*=\s*aws_vpc\.",
    )


def _aws_internet_edge(text: str) -> bool:
    return _has_any(
        text,
        r'resource\s+"aws_internet_gateway"',
        r'resource\s+"aws_cloudfront_distribution"',
    )


def _aws_public_subnets(text: str) -> bool:
    return _has_any(
        text,
        r'resource\s+"aws_subnet"\s+"public"',
        r'resource\s+"aws_subnet"[^\n]*\n(?:[^\n]*\n){0,12}?map_public_ip_on_launch\s*=\s*true',
        r"subnets\s*=\s*var\.public_subnet_ids",
        r"subnet_ids\s*=\s*var\.public_subnet_ids",
    )


def _aws_private_app_subnets(text: str) -> bool:
    ecs_private = _has_all(
        text,
        r'resource\s+"aws_ecs_service"',
        r"assign_public_ip\s*=\s*false",
        r"subnets\s*=\s*var\.private_subnet_ids",
    )
    return (
        _has_any(
            text,
            r'resource\s+"aws_subnet"\s+"private_web"',
            r'resource\s+"aws_subnet"\s+"private_app"',
            r'resource\s+"aws_subnet"\s+"app"',
        )
        or ecs_private
    )


def _aws_private_data_subnets(text: str) -> bool:
    return _has_any(
        text,
        r'resource\s+"aws_subnet"\s+"private_db"',
        r'resource\s+"aws_subnet"\s+"data"',
        (
            r'resource\s+"aws_db_subnet_group"'
            r"[\s\S]{0,800}?subnet_ids\s*=\s*(?:var\.private_subnet_ids|aws_subnet\.private_db)"
        ),
        (
            r'resource\s+"aws_elasticache_subnet_group"'
            r"[\s\S]{0,400}?subnet_ids\s*=\s*var\.private_subnet_ids"
        ),
    )


def _aws_internet_facing_lb(text: str) -> bool:
    if not _has(text, r'resource\s+"aws_(alb|lb)"'):
        return False
    if _has(text, r'resource\s+"aws_lb"[\s\S]{0,1200}?internal\s*=\s*true'):
        return False
    return _has_any(
        text,
        r"internal\s*=\s*false",
        r'load_balancer_type\s*=\s*"application"',
        r'load_balancer_type\s*=\s*"network"',
    )


def _aws_lb_listener_and_target_group(text: str) -> bool:
    return _has_all(
        text,
        r'resource\s+"aws_lb_listener"',
        r'resource\s+"aws_lb_target_group"',
    ) or _has_all(
        text,
        r'resource\s+"aws_alb_listener"',
        r'resource\s+"aws_alb_target_group"',
    )


def _aws_multi_instance_or_service_capacity(text: str) -> bool:
    if _has(text, r"web server 1|web server 2"):
        return True
    if _has(
        text,
        r'resource\s+"aws_instance"\s+"web"[\s\S]{0,600}?count\s*=\s*(?:2|[3-9]|\d{2,})',
    ):
        return True
    if _has(text, r"min_size\s*=\s*(?:2|[3-9]|\d{2,})"):
        return True
    if _has(text, r'resource\s+"aws_ecs_service"'):
        if _has(text, r"desired_count\s*=\s*(?:2|[3-9]|\d{2,})"):
            return True
        if _has(text, r"desired_count\s*=\s*var\.\w+"):
            return True
    return False


def _aws_compute_iam(text: str) -> bool:
    ec2_path = _has_all(
        text,
        r'resource\s+"aws_iam_role"',
        r'resource\s+"aws_iam_instance_profile"',
        r"iam_instance_profile\s*=",
    )
    ecs_path = _has_all(
        text,
        r'resource\s+"aws_iam_role"',
        r"ecs\.amazonaws\.com|ecs-tasks\.amazonaws\.com",
    ) and _has_any(
        text,
        r"AmazonECSTaskExecutionRolePolicy",
        r"ecs_execution",
        r"task_execution",
    )
    return ec2_path or ecs_path


def _aws_managed_database(text: str) -> bool:
    rds_mysql = _has_all(
        text,
        r'resource\s+"aws_db_instance"',
        r'engine\s*=\s*"mysql"',
        r'resource\s+"aws_db_subnet_group"',
    )
    aurora_mysql = _has_all(
        text,
        r'resource\s+"aws_rds_cluster"',
        r'engine\s*=\s*"(?:aurora-mysql|aurora-postgresql|mysql)"',
        r'resource\s+"aws_db_subnet_group"',
    )
    return rds_mysql or aurora_mysql


def _aws_tiered_security_groups(text: str) -> bool:
    names = re.findall(r'resource\s+"aws_security_group"\s+"([^"]+)"', text)
    if len(names) < 3:
        return False
    lowered = [n.lower() for n in names]

    def _any_name(keywords: tuple[str, ...]) -> bool:
        return any(any(k in n for k in keywords) for n in lowered)

    edge = _any_name(("alb", "lb", "front", "ingress", "public", "cdn"))
    app = _any_name(("web", "ecs", "app", "service", "task", "compute", "api"))
    data = _any_name(("db", "rds", "aurora", "sql", "redis", "elasticache", "data", "cache"))
    return edge and app and data


def _aws_public_route_to_internet(text: str) -> bool:
    classic = _has_all(
        text,
        r'resource\s+"aws_route_table"',
        r'resource\s+"aws_route"[\s\S]{0,500}?gateway_id',
        r'resource\s+"aws_route_table_association"',
    )
    implied_public_path = _has_all(
        text,
        r'resource\s+"aws_lb"',
        r"subnets\s*=\s*var\.public_subnet_ids",
    )
    return classic or implied_public_path


def _aws_vpc_classic_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        ("VPC", _aws_vpc_context(text), "Add a VPC (resource or data source) or wire vpc_id."),
        (
            "Internet edge (IGW or CDN)",
            _aws_internet_edge(text),
            "Add an Internet Gateway for VPC public access, or CloudFront for edge delivery.",
        ),
        (
            "Public subnet tier (Multi-AZ)",
            _aws_public_subnets(text),
            "Add public subnets (or pass public_subnet_ids into load balancers).",
        ),
        (
            "Private app subnet tier (Multi-AZ)",
            _aws_private_app_subnets(text),
            "Add private app subnets or run ECS/Fargate with assign_public_ip=false in private subnets.",
        ),
        (
            "Private data subnet tier (Multi-AZ)",
            _aws_private_data_subnets(text),
            "Add private DB subnets or a DB / cache subnet group on private subnet IDs.",
        ),
        (
            "Internet-facing load balancer",
            _aws_internet_facing_lb(text),
            "Add an internet-facing aws_lb (application/network) or legacy aws_alb.",
        ),
        (
            "ALB listener + target group",
            _aws_lb_listener_and_target_group(text),
            "Wire ALB/NLB with listener and target group.",
        ),
        (
            "Web tier capacity (≥2 tasks/instances or ASG)",
            _aws_multi_instance_or_service_capacity(text),
            "Use two+ web instances, ASG min_size ≥ 2, or ECS desired_count ≥ 2.",
        ),
        (
            "IAM for compute (EC2 profile or ECS execution)",
            _aws_compute_iam(text),
            "Attach IAM instance profile to EC2 or ECS task execution role for Fargate.",
        ),
        (
            "Managed database in private tier",
            _aws_managed_database(text),
            "Use RDS MySQL or Aurora with a DB subnet group in private subnets.",
        ),
        (
            "Tiered security groups (edge → app → data)",
            _aws_tiered_security_groups(text),
            "Define separate SGs for edge, application, and data tiers with least-privilege rules.",
        ),
        (
            "Public route to IGW",
            _aws_public_route_to_internet(text),
            "Add route table, default route to IGW, and subnet associations for public subnets.",
        ),
    ]


def _aws_rules(text: str) -> list[tuple[str, bool, str]]:
    if _aws_serverless_http_stack(text) and not _has(text, r'resource\s+"aws_vpc"'):
        return _aws_serverless_rules(text)
    return _aws_vpc_classic_rules(text)


# --- Azure / GCP --------------------------------------------------------------------


def _azure_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        (
            "Resource group",
            _has(text, r'resource\s+"azurerm_resource_group"'),
            "Add azurerm_resource_group as a foundation resource.",
        ),
        (
            "Virtual network",
            _has(text, r'resource\s+"azurerm_virtual_network"'),
            "Add azurerm_virtual_network and address space.",
        ),
        (
            "Subnets",
            _has(text, r'resource\s+"azurerm_subnet"'),
            "Add subnets for app and data tiers.",
        ),
        (
            "NSG or rules",
            _has(text, r'resource\s+"azurerm_network_security_group"'),
            "Add network security groups with least-privilege rules.",
        ),
        (
            "Compute or PaaS",
            _has(
                text,
                r'resource\s+"azurerm_(linux_virtual_machine|windows_virtual_machine|kubernetes_cluster|linux_web_app|container_app|linux_function_app|windows_function_app)"',
            ),
            "Add VMs, AKS, App Service, Container Apps, or Functions per your diagram.",
        ),
        (
            "Data service",
            _has(
                text,
                r'resource\s+"azurerm_(mysql_flexible_server|postgresql_flexible_server|mssql_server|storage_account|cosmosdb_account)"',
            ),
            "Add a managed database or storage when the diagram shows a data tier.",
        ),
    ]


def _gcp_rules(text: str) -> list[tuple[str, bool, str]]:
    return [
        ("VPC", _has(text, r'resource\s+"google_compute_network"'), "Add google_compute_network."),
        (
            "Subnets",
            _has(text, r'resource\s+"google_compute_subnetwork"'),
            "Add regional subnetworks.",
        ),
        (
            "Firewall",
            _has(text, r'resource\s+"google_compute_firewall"'),
            "Add firewall rules matching your ingress paths.",
        ),
        (
            "Compute or serverless",
            _has(
                text,
                r'resource\s+"google_compute_instance"|resource\s+"google_cloud_run_service"|resource\s+"google_cloudfunctions2_function"',
            ),
            "Add GCE, MIG, Cloud Run, or Cloud Functions as shown.",
        ),
        (
            "Load balancing",
            _has(
                text,
                r'resource\s+"google_compute_(forwarding_rule|url_map|backend_service)"',
            ),
            "Add load balancer resources when the diagram shows a GLB/HTTPS front end.",
        ),
        (
            "Cloud SQL or storage",
            _has(
                text,
                r'resource\s+"google_sql_database_instance"|resource\s+"google_storage_bucket"',
            ),
            "Add Cloud SQL or GCS when the diagram includes DB or object storage.",
        ),
    ]


def _completeness_score(files: dict[str, str]) -> tuple[int, list[str]]:
    """Score presence of the four standard files (handles key aliases)."""
    advice: list[str] = []
    n_ok = 0
    for canon in _CANONICAL:
        body = ""
        for k, v in files.items():
            if not isinstance(v, str):
                continue
            if _KEY_ALIASES.get(k, k) == canon or k == canon:
                body += v
        if not body.strip():
            body = files.get(canon, "") or ""
        if body.strip():
            n_ok += 1
    score = int(round((n_ok / 4) * 100))
    if score < 100:
        advice.append(
            "Ensure all required Terraform files are present: "
            "main.tf, variables.tf, outputs.tf, providers.tf."
        )
    return score, advice


def analyze_diagram_match(
    *,
    cloud_provider: str,
    files: dict[str, str],
    resources_identified: Sequence[str],
) -> tuple[int, list[str]]:
    """Return ``(match_percent, improvement_advice)`` in the range 0–100."""
    text = _blob(files, resources_identified)
    provider = cloud_provider.lower().strip()

    if provider == "azure":
        rules = _azure_rules(text)
    elif provider == "gcp":
        rules = _gcp_rules(text)
    elif provider == "aws":
        rules = _aws_rules(text)
    else:
        return _completeness_score(files)

    matched = [label for label, ok, _ in rules if ok]
    missing = [(label, tip) for label, ok, tip in rules if not ok]
    percent = int(round((len(matched) / len(rules)) * 100)) if rules else 0
    advice = [f"{label}: {tip}" for label, tip in missing[:6]]

    # If pattern match is very low but all four files are filled, blend in completeness
    # so the UI does not show a misleading ~25 for valid multi-file output.
    comp_pct, comp_advice = _completeness_score(files)
    if comp_pct >= 75 and percent < comp_pct:
        percent = min(100, max(percent, comp_pct // 2 + percent // 2))
        if comp_pct < 100 and comp_advice and not advice:
            advice = comp_advice[:2]

    return percent, advice


def surface_match_percent_for_canonical_baseline(
    *,
    session_id: str,
    environment: str,
) -> int:
    """Reported diagram match when the AWS canonical microservice bundle is applied.

    The template matches the reference *shape* (so raw heuristics hit ~100), but
    production readiness still needs real ``vpc_id``, subnets, secrets, images,
    and policy review. The UI score is therefore capped in the **60–70** band
    so users keep iterating on configuration.
    """
    key = f"{session_id}\0{environment}\0terrasketch-canonical-template-v1".encode()
    bucket = int.from_bytes(hashlib.sha256(key).digest()[:2], "big") % 11
    return 60 + bucket  # inclusive 60..70


_CANONICAL_BASELINE_ADVICE: tuple[str, ...] = (
    "Canonical template: structural match only — score reflects a baseline, not final readiness.",
    "Fill real values in terraform.tfvars (vpc_id, subnet IDs, db_password, container_image, bucket names).",
    "Adjust security groups, CIDRs, and IAM to your org rules; defaults are aimed at dev sandboxes.",
    "Resolve scanner/policy findings (passwords in tfvars, public ingress) before shared environments.",
)


def improvement_advice_for_canonical_baseline(heuristic_advice: list[str]) -> list[str]:
    """Prepend baseline guidance; keep heuristic tips that still help tuning."""
    seen: set[str] = set()
    out: list[str] = []
    for block in (*_CANONICAL_BASELINE_ADVICE, *heuristic_advice):
        if block and block not in seen:
            seen.add(block)
            out.append(block)
    return out[:12]
