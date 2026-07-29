"""Reorganize a flat main.tf into per-concern files (network/compute/data/...).

All files stay in ONE root module directory, so Terraform still evaluates them
as a single configuration — every cross-reference resolves exactly as before and
the result is byte-for-byte equivalent to `apply`, just easier to read. This is
deliberately NOT a nested-module split: turning arbitrary HCL into `modules/*`
would require rewiring every cross-module reference through variables/outputs,
which can silently break a working config.

Only ``main.tf`` is re-bucketed; ``variables.tf`` / ``outputs.tf`` /
``providers.tf`` are kept verbatim (comments and all). Any stray
variable/output/terraform/provider blocks that happen to live in main.tf are
moved to the matching canonical file.
"""

from __future__ import annotations

import re

# resource/data type → concern file. First matching substring wins, checked in
# the order listed, so put more specific patterns first.
_CONCERN_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        "network.tf",
        (
            "vpc", "subnet", "internet_gateway", "nat_gateway", "route_table",
            "route53", "_route", "eip", "vpc_endpoint", "vpc_peering",
            "network_interface", "egress_only", "default_network_acl",
            "network_acl", "main_route_table",
        ),
    ),
    (
        "security.tf",
        (
            "security_group", "iam_", "kms_", "acm_", "wafv2", "waf_", "shield",
            "secretsmanager", "ssm_parameter", "guardduty", "network_acl_rule",
        ),
    ),
    (
        "data.tf",
        (
            "_rds_", "db_instance", "db_subnet", "db_parameter", "db_option",
            "rds_cluster", "aurora", "dynamodb", "elasticache", "s3_",
            "s3_bucket", "efs_", "redshift", "documentdb", "neptune",
            "backup_", "glacier",
        ),
    ),
    (
        "compute.tf",
        (
            "instance", "ecs_", "ecr_", "lb", "alb", "elb", "target_group",
            "listener", "launch_template", "launch_configuration", "autoscaling",
            "lambda_", "apigatewayv2", "api_gateway", "cloudfront", "beanstalk",
            "app_runner", "batch_", "eks_",
        ),
    ),
    (
        "observability.tf",
        ("cloudwatch", "_logs_", "log_group", "sns_", "sqs_", "xray", "cloudtrail"),
    ),
]

_FALLBACK = "main.tf"

# Keep these verbatim; only receive stray blocks of their kind found in main.tf.
_CANONICAL = {
    "variable": "variables.tf",
    "output": "outputs.tf",
    "terraform": "providers.tf",
    "provider": "providers.tf",
}

_HEADERS = {
    "network.tf": "# Networking — VPC, subnets, routing, gateways.",
    "security.tf": "# Security — security groups, IAM, KMS, secrets.",
    "data.tf": "# Data — databases, caches, object storage.",
    "compute.tf": "# Compute — instances, containers, load balancers, functions.",
    "observability.tf": "# Observability — logs, metrics, alarms, messaging.",
    "main.tf": "# Root — locals and anything not tied to a single concern.",
}

_BLOCK_START_RE = re.compile(
    r'^(resource|data|module|locals|variable|output|terraform|provider|moved|import)\b'
)
_TYPE_RE = re.compile(r'^\s*(?:resource|data)\s+"([^"]+)"')


def _top_level_blocks(text: str) -> list[tuple[str, str, list[str]]]:
    """Yield (keyword, type_label, lines) for each top-level block, carrying any
    immediately-preceding comment/blank lines with the block."""
    lines = text.splitlines()
    blocks: list[tuple[str, str, list[str]]] = []
    pending: list[str] = []  # leading comments/blanks not yet attached
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        m = _BLOCK_START_RE.match(line)
        if not m:
            # Comment or blank line at top level → hold as a lead-in for next block.
            if line.strip() == "" or line.lstrip().startswith(("#", "//")):
                pending.append(line)
                i += 1
                continue
            # Stray non-block content at top level — attach to fallback as-is.
            pending.append(line)
            i += 1
            continue

        keyword = m.group(1)
        tm = _TYPE_RE.match(line)
        type_label = tm.group(1) if tm else keyword

        # Consume until braces balance (block bodies always use {}).
        depth = 0
        started = False
        body: list[str] = list(pending)
        pending = []
        while i < n:
            cur = lines[i]
            body.append(cur)
            for ch in cur:
                if ch == "{":
                    depth += 1
                    started = True
                elif ch == "}":
                    depth -= 1
            i += 1
            if started and depth <= 0:
                break
        blocks.append((keyword, type_label, body))

    # Any trailing comments/blanks: keep them in fallback.
    if any(l.strip() for l in pending):
        blocks.append(("__trailing__", "", pending))
    return blocks


def _concern_for(type_label: str) -> str:
    t = type_label.lower()
    for filename, needles in _CONCERN_RULES:
        if any(nd in t for nd in needles):
            return filename
    return _FALLBACK


def split_by_concern(files: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """Return (new_files, notes). new_files reorganizes main.tf's blocks into
    per-concern files; other files pass through. On nothing to split, returns the
    input unchanged with an explanatory note."""
    main = files.get("main.tf", "")
    if not main.strip():
        return dict(files), ["Nothing to split — main.tf is empty."]

    blocks = _top_level_blocks(main)
    resource_like = [b for b in blocks if b[0] in ("resource", "data", "module")]
    if len(resource_like) < 2:
        return dict(files), [
            "Nothing to split — main.tf has fewer than two resources, so a single "
            "file is already the clearest layout."
        ]

    # Start from the passthrough files (variables/outputs/providers kept verbatim).
    buckets: dict[str, list[str]] = {}
    canonical_extra: dict[str, list[str]] = {}

    for keyword, type_label, body in blocks:
        chunk = "\n".join(body).strip("\n")
        if not chunk.strip():
            continue
        if keyword in _CANONICAL:
            # A variable/output/terraform/provider block found inside main.tf.
            canonical_extra.setdefault(_CANONICAL[keyword], []).append(chunk)
        elif keyword in ("locals", "__trailing__"):
            buckets.setdefault(_FALLBACK, []).append(chunk)
        else:  # resource / data / module / moved / import
            buckets.setdefault(_concern_for(type_label), []).append(chunk)

    new_files = dict(files)

    # Build concern files with a header comment; drop the old flat main.tf first.
    new_files.pop("main.tf", None)
    for filename, chunks in buckets.items():
        header = _HEADERS.get(filename, f"# {filename}")
        new_files[filename] = header + "\n\n" + "\n\n".join(chunks) + "\n"

    # Append any stray canonical blocks to their proper file.
    for filename, chunks in canonical_extra.items():
        existing = new_files.get(filename, "")
        joined = "\n\n".join(chunks)
        new_files[filename] = (existing.rstrip() + "\n\n" + joined + "\n") if existing.strip() else joined + "\n"

    produced = sorted(f for f in buckets if f != _FALLBACK)
    notes = [
        "Split main.tf into per-concern files: "
        + ", ".join(produced + ([_FALLBACK] if _FALLBACK in buckets else []))
        + ". All files stay in one root module, so the plan is unchanged — this is "
        "purely for readability.",
    ]
    return new_files, notes
