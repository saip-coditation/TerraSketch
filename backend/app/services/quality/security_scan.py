"""Best-practices security scanner for generated Terraform.

Complements secret_scan.py (which finds hardcoded secrets). This flags common
misconfigurations — world-open security groups, public/unencrypted storage,
wildcard IAM, HTTP-allowing CloudFront — as short, actionable warnings surfaced
on the result page. Deterministic and regex-based (no LLM).
"""

from __future__ import annotations

import re

# Ports that should almost never be open to 0.0.0.0/0.
_SENSITIVE_PORTS = {
    22: "SSH",
    3389: "RDP",
    3306: "MySQL",
    5432: "PostgreSQL",
    6379: "Redis",
    11211: "Memcached",
    27017: "MongoDB",
    9200: "Elasticsearch",
    1433: "SQL Server",
}


def _iter_blocks(text: str, header_re: str):
    """Yield (local_name, body) for each `<header> "..." "name" {...}` block."""
    for m in re.finditer(header_re, text):
        ob = text.index("{", m.start())
        depth, end = 0, ob
        for j in range(ob, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        yield m.groups()[-1] if m.groups() else "", text[ob : end + 1]


def scan_best_practices(files: dict) -> list[str]:
    main = (files or {}).get("main.tf") or ""
    if not main:
        return []
    findings: list[str] = []

    # 1) Security groups: 0.0.0.0/0 on a sensitive port, or fully open ingress.
    for _, body in _iter_blocks(main, r'resource\s+"aws_security_group"\s+"([A-Za-z0-9_]+)"\s*\{'):
        for ing in re.findall(r"ingress\s*\{([^}]*)\}", body, re.S):
            if "0.0.0.0/0" not in ing:
                continue
            fp = re.search(r"from_port\s*=\s*(\d+)", ing)
            tp = re.search(r"to_port\s*=\s*(\d+)", ing)
            proto = re.search(r'protocol\s*=\s*"([^"]+)"', ing)
            frm = int(fp.group(1)) if fp else None
            to = int(tp.group(1)) if tp else None
            if proto and proto.group(1) == "-1" or (frm == 0 and to == 0) or (frm == 0 and to == 65535):
                findings.append(
                    "🔴 A security group allows ALL inbound traffic from 0.0.0.0/0 — restrict to the ports and source ranges you actually need."
                )
                continue
            if frm is not None and frm in _SENSITIVE_PORTS:
                findings.append(
                    f"🔴 A security group exposes {_SENSITIVE_PORTS[frm]} (port {frm}) to the whole internet (0.0.0.0/0) — restrict the source CIDR."
                )

    # 2) S3 buckets without a public access block.
    buckets = [n for n, _ in _iter_blocks(main, r'resource\s+"aws_s3_bucket"\s+"([A-Za-z0-9_]+)"\s*\{')]
    for name in buckets:
        if not re.search(rf'resource\s+"aws_s3_bucket_public_access_block"\s+"[^"]*"\s*\{{[^}}]*bucket\s*=\s*aws_s3_bucket\.{name}\b', main, re.S):
            findings.append(
                f"🟠 S3 bucket `{name}` has no aws_s3_bucket_public_access_block — add one to block public ACLs/policies."
            )
        if not re.search(rf'aws_s3_bucket_server_side_encryption_configuration"\s+"[^"]*"\s*\{{[^}}]*bucket\s*=\s*aws_s3_bucket\.{name}\b', main, re.S) and "server_side_encryption_configuration" not in main:
            findings.append(f"🟠 S3 bucket `{name}` doesn't declare server-side encryption — enable SSE (AES256 or KMS).")

    # 3) RDS / Aurora without encryption at rest.
    for kind in ("aws_db_instance", "aws_rds_cluster"):
        for name, body in _iter_blocks(main, rf'resource\s+"{kind}"\s+"([A-Za-z0-9_]+)"\s*\{{'):
            if not re.search(r"storage_encrypted\s*=\s*true", body):
                findings.append(f"🟠 Database `{kind}.{name}` isn't encrypted at rest — set storage_encrypted = true.")

    # 4) Wildcard IAM (Action "*" with Resource "*"). Match both JSON ("Action")
    # and HCL jsonencode (Action) key forms.
    if re.search(r'"?Action"?\s*[:=]\s*(?:"\*"|\[\s*"\*"\s*\])', main) and re.search(
        r'"?Resource"?\s*[:=]\s*(?:"\*"|\[\s*"\*"\s*\])', main
    ):
        findings.append('🔴 An IAM policy grants Action "*" on Resource "*" (full admin) — scope it to the specific actions/resources needed.')

    # 5) CloudFront allowing plain HTTP.
    if re.search(r'viewer_protocol_policy\s*=\s*"allow-all"', main):
        findings.append('🟠 CloudFront allows plain HTTP (viewer_protocol_policy = "allow-all") — use "redirect-to-https".')

    # De-dupe while preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for f in findings:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out
