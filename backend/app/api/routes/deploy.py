"""Deploy endpoints — generate → apply/destroy to the user's own AWS account.

Flow:
- The user POSTs /api/deploy with their *transient* AWS keys. We load the
  generation's files and create an in-memory deployment job (keys in RAM only).
- The Terraform worker (separate box) polls /api/worker/next-job, runs
  terraform, and POSTs status/logs/state back to /api/worker/jobs/{id}.
- The frontend polls /api/deploy/{id} for live status + logs + outputs.

Security: AWS keys live only in this process's memory and are handed to the
worker exactly once (then cleared). Never written to disk, DB, or logs.

Note (MVP): the store is in-process memory — fine for a single-instance host;
deployments are lost on restart. DB persistence is a later hardening step.
"""

import json
import re
import secrets
import threading
import time
import uuid

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db import models

router = APIRouter()

_LOCK = threading.Lock()
_DEPLOYMENTS: dict[str, dict] = {}
_PUBLIC_FIELDS = ("id", "action", "status", "region", "outputs", "error", "logs", "created_at")


def _public(d: dict) -> dict:
    return {k: d.get(k) for k in _PUBLIC_FIELDS}


def _require_worker(authorization: str | None) -> None:
    token = get_settings().WORKER_TOKEN
    if not token:
        raise HTTPException(status_code=503, detail="Deploy worker is not configured.")
    if authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="Invalid worker token.")


def _var_blocks(variables_tf: str):
    """Yield (name, body) for each `variable "name" { ... }` block."""
    for m in re.finditer(r'variable\s+"([^"]+)"\s*\{', variables_tf or ""):
        start = variables_tf.index("{", m.start())
        depth = 0
        for j in range(start, len(variables_tf)):
            if variables_tf[j] == "{":
                depth += 1
            elif variables_tf[j] == "}":
                depth -= 1
                if depth == 0:
                    yield m.group(1), variables_tf[start + 1 : j]
                    break


def _example_value(name: str, body: str, region: str, suffix: str) -> str:
    tmatch = re.search(r"type\s*=\s*([A-Za-z0-9_().]+)", body)
    t = (tmatch.group(1) if tmatch else "string").lower()
    low = name.lower()
    if t.startswith("number"):
        return "1"
    if t.startswith("bool"):
        return "false"
    if t.startswith("list"):
        return "[]"
    if t.startswith("map") or t.startswith("object"):
        return "{}"
    if "region" in low or "location" in low:
        return f'"{region}"'
    if "cidr" in low:
        return '"10.0.0.0/16"'
    if "availability_zone" in low or low.endswith("_az"):
        return f'"{region}a"'
    return f'"terrasketch-demo-{suffix}"'


def inject_var_defaults(variables_tf: str, region: str) -> str:
    """Add `default = <example>` to any variable that lacks one, so `apply` does
    not fail on "No value for required variable". Edits variables.tf in place so
    it works regardless of worker version (no separate tfvars file needed)."""
    if not variables_tf:
        return variables_tf
    suffix = uuid.uuid4().hex[:6]
    inserts = []  # (position, text)
    for m in re.finditer(r'variable\s+"([^"]+)"\s*\{', variables_tf):
        name = m.group(1)
        brace = variables_tf.index("{", m.start())
        depth = 0
        end = brace
        for j in range(brace, len(variables_tf)):
            if variables_tf[j] == "{":
                depth += 1
            elif variables_tf[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        body = variables_tf[brace + 1 : end]
        if re.search(r"(^|\n)\s*default\s*=", body):
            continue  # already has a default — leave it
        val = _example_value(name, body, region, suffix)
        inserts.append((brace + 1, f"\n  default = {val}"))
    if not inserts:
        return variables_tf
    result = variables_tf
    for pos, text in sorted(inserts, reverse=True):  # back-to-front keeps offsets valid
        result = result[:pos] + text + result[pos:]
    return result


# Standard no-arg AWS data sources the model often references but forgets to declare.
_COMMON_DATA_SOURCES = {
    ("aws_availability_zones", "available"): 'data "aws_availability_zones" "available" {\n  state = "available"\n}',
    ("aws_caller_identity", "current"): 'data "aws_caller_identity" "current" {}',
    ("aws_region", "current"): 'data "aws_region" "current" {}',
    ("aws_partition", "current"): 'data "aws_partition" "current" {}',
}


def ensure_data_sources(files: dict) -> dict:
    """Inject declarations for common data sources that are referenced but not
    declared (e.g. data.aws_availability_zones.available used without a block)."""
    all_text = "\n".join(v or "" for v in files.values())
    additions = []
    for (dtype, dname), block in _COMMON_DATA_SOURCES.items():
        ref = f"data.{dtype}.{dname}"
        declared = re.search(rf'data\s+"{dtype}"\s+"{dname}"', all_text)
        if ref in all_text and not declared:
            additions.append(block)
    if additions and files.get("main.tf") is not None:
        merged = files["main.tf"].rstrip() + "\n\n" + "\n\n".join(additions) + "\n"
        files = {**files, "main.tf": merged}
    return files


def fix_terraform_files(files: dict, error: str) -> dict:
    """Ask the LLM to repair the files given a terraform validate/apply error.
    Returns a new files dict (unchanged files preserved)."""
    from app.api.routes.review import _call_llm  # reuse the provider-agnostic LLM call

    system = (
        "You are a Terraform expert. The given Terraform files failed `terraform validate` or "
        "`terraform apply`. Fix the error WITHOUT changing the intended architecture. Rules: target "
        "AWS provider ~> 5.0; declare every data.<type>.<name> you reference; never use nested config "
        "blocks removed in provider v4/v5 (use separate aws_s3_bucket_* resources, etc.); give every "
        "variable a default; keep the stack self-contained (create its own VPC/subnets; resolve AMIs "
        "via data.aws_ami). Return ONLY a JSON object with keys \"main.tf\", \"variables.tf\", "
        "\"outputs.tf\", \"providers.tf\", each mapping to the COMPLETE corrected file content. No prose."
    )
    blob = "\n\n".join(f"=== {n} ===\n{c}" for n, c in files.items() if (c or "").strip())
    user = f"terraform error:\n{error}\n\nCurrent files:\n{blob}"

    raw = (_call_llm(system, user) or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]+\}", raw)
        data = json.loads(m.group()) if m else {}

    out = dict(files)
    for k in ("main.tf", "variables.tf", "outputs.tf", "providers.tf"):
        v = data.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v
    return out


def harden_rds_for_teardown(files: dict) -> dict:
    """Force RDS to be destroyable: skip_final_snapshot=true, deletion_protection=false.
    Otherwise `terraform destroy` fails on RDS and leaves a costly orphan."""
    main = files.get("main.tf")
    if not main or ("aws_db_instance" not in main and "aws_rds_cluster" not in main):
        return files

    pattern = re.compile(r'resource\s+"(?:aws_db_instance|aws_rds_cluster)"\s+"[^"]+"\s*\{')
    result = main
    for m in reversed(list(pattern.finditer(main))):
        brace = main.index("{", m.start())
        depth = 0
        end = brace
        for j in range(brace, len(main)):
            if main[j] == "{":
                depth += 1
            elif main[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        body = result[brace + 1 : end]
        if re.search(r"\bskip_final_snapshot\b", body):
            body = re.sub(r"skip_final_snapshot\s*=\s*[^\n]+", "skip_final_snapshot = true", body)
        else:
            body = "\n  skip_final_snapshot = true" + body
        if re.search(r"\bdeletion_protection\b", body):
            body = re.sub(r"deletion_protection\s*=\s*[^\n]+", "deletion_protection = false", body)
        else:
            body = "\n  deletion_protection = false" + body
        result = result[: brace + 1] + body + result[end:]

    return {**files, "main.tf": result}


def prepare_files_for_deploy(files: dict, region: str) -> dict:
    """Make generated files deployable: substitute <REPLACE_*> placeholders with
    real, AWS-valid, unique values; force the provider region; and give any
    no-default variables a value. Returns a new files dict."""
    suffix = uuid.uuid4().hex[:8]
    safe_name = f"terrasketch-demo-{suffix}"  # lowercase + hyphens → valid S3/most names
    password = "Ts1" + secrets.token_urlsafe(18)  # strong, RDS-safe (no / @ " space)

    out: dict[str, str] = {}
    for name, content in (files or {}).items():
        c = content or ""
        c = c.replace("<REPLACE_REGION>", region)
        c = re.sub(r"<REPLACE_[A-Z0-9_]*CIDR[A-Z0-9_]*>", "10.0.0.0/16", c)
        c = re.sub(r"<REPLACE_[A-Z0-9_]*(?:AZ|AVAILABILITY)[A-Z0-9_]*>", f"{region}a", c)
        # secrets/passwords → a strong generated value (so RDS etc. apply)
        c = re.sub(r"<REPLACE_[A-Z0-9_]*(?:PASSWORD|SECRET|PASS|PWD)[A-Z0-9_]*>", password, c)
        # any remaining placeholder → a safe, unique name
        c = re.sub(r"<REPLACE_[A-Z0-9_]+>", safe_name, c)
        out[name] = c

    # Force the provider's region to the one the user picked (covers a hardcoded region).
    if out.get("providers.tf"):
        out["providers.tf"] = re.sub(
            r'region\s*=\s*"[^"]*"', f'region = "{region}"', out["providers.tf"], count=1
        )

    # Fill any required (no-default) variables so apply doesn't fail.
    if out.get("variables.tf"):
        out["variables.tf"] = inject_var_defaults(out["variables.tf"], region)

    # Declare any common data sources referenced but not declared.
    out = ensure_data_sources(out)

    # Force RDS to be destroyable (skip_final_snapshot / deletion_protection).
    out = harden_rds_for_teardown(out)

    return out


class DeployRequest(BaseModel):
    generation_id: str
    region: str = "us-east-1"
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_session_token: str | None = None


class DestroyRequest(BaseModel):
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_session_token: str | None = None
    confirm: bool = False


class FixRequest(BaseModel):
    files: dict[str, str]
    error: str = ""


# ── User-facing ───────────────────────────────────────────────────────────────

@router.post("/deploy", summary="Apply a generation's Terraform to the user's AWS account")
@limiter.limit(get_settings().RATE_LIMIT_GENERATE)
def post_deploy(
    request: Request,
    payload: DeployRequest,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_user),
) -> dict:
    if not get_settings().WORKER_TOKEN:
        raise HTTPException(status_code=503, detail="Deploy is not enabled on this server.")
    gen = db.get(models.Generation, payload.generation_id.strip())
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")
    files = gen.generated_files or {}
    if not files:
        raise HTTPException(status_code=400, detail="Generation has no files to deploy")

    # Make the generated files deployable: substitute <REPLACE_*> placeholders
    # (region, names, CIDRs), force the provider region, and default any
    # required variables.
    files = prepare_files_for_deploy(files, payload.region)

    did = str(uuid.uuid4())
    with _LOCK:
        _DEPLOYMENTS[did] = {
            "id": did,
            "generation_id": payload.generation_id,
            "action": "apply",
            "status": "queued",
            "region": payload.region,
            "files": files,
            "state": None,
            "outputs": {},
            "logs": "",
            "error": None,
            "keys": {
                "aws_access_key_id": payload.aws_access_key_id,
                "aws_secret_access_key": payload.aws_secret_access_key,
                "aws_session_token": payload.aws_session_token,
            },
            "created_at": time.time(),
        }
    return {"deployment_id": did}


@router.get("/deploy/{deployment_id}", summary="Deployment status, logs and outputs")
def get_deploy(deployment_id: str) -> dict:
    with _LOCK:
        d = _DEPLOYMENTS.get(deployment_id)
        if not d:
            raise HTTPException(status_code=404, detail="Deployment not found")
        return _public(d)


@router.post("/deploy/{deployment_id}/destroy", summary="Destroy a deployed stack")
@limiter.limit(get_settings().RATE_LIMIT_GENERATE)
def post_destroy(request: Request, deployment_id: str, payload: DestroyRequest) -> dict:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Destroy must be confirmed.")
    with _LOCK:
        d = _DEPLOYMENTS.get(deployment_id)
        if not d:
            raise HTTPException(status_code=404, detail="Deployment not found")
        if not d.get("state"):
            raise HTTPException(status_code=400, detail="Nothing to destroy (no saved state).")
        d["action"] = "destroy"
        d["status"] = "queued"
        d["error"] = None
        d["logs"] = (d.get("logs") or "") + "\n--- destroy requested ---\n"
        d["keys"] = {
            "aws_access_key_id": payload.aws_access_key_id,
            "aws_secret_access_key": payload.aws_secret_access_key,
            "aws_session_token": payload.aws_session_token,
        }
    return {"ok": True}


# ── Worker-facing (token-authenticated) ───────────────────────────────────────

@router.get("/worker/next-job", summary="Worker: claim the next queued job")
def worker_next_job(authorization: str | None = Header(default=None)):
    _require_worker(authorization)
    with _LOCK:
        for d in sorted(_DEPLOYMENTS.values(), key=lambda x: x["created_at"]):
            if d["status"] == "queued":
                d["status"] = "running"
                keys = d.get("keys") or {}
                d["keys"] = None  # served once → drop from memory
                return {
                    "id": d["id"],
                    "action": d["action"],
                    "region": d["region"],
                    "files": d["files"],
                    "state": d.get("state"),
                    "aws_access_key_id": keys.get("aws_access_key_id", ""),
                    "aws_secret_access_key": keys.get("aws_secret_access_key", ""),
                    "aws_session_token": keys.get("aws_session_token"),
                }
    return Response(status_code=204)


@router.post("/worker/fix", summary="Worker: ask the LLM to repair files given a terraform error")
def worker_fix(payload: FixRequest, authorization: str | None = Header(default=None)) -> dict:
    _require_worker(authorization)
    try:
        return {"files": fix_terraform_files(payload.files, payload.error)}
    except Exception as exc:  # noqa: BLE001 — fix is best-effort
        return {"files": payload.files, "error": str(exc)}


@router.post("/worker/jobs/{job_id}", summary="Worker: post status/logs/state for a job")
def worker_update(
    job_id: str,
    payload: dict = Body(default={}),
    authorization: str | None = Header(default=None),
) -> dict:
    _require_worker(authorization)
    with _LOCK:
        d = _DEPLOYMENTS.get(job_id)
        if not d:
            raise HTTPException(status_code=404, detail="Job not found")
        appended = payload.get("log_append")
        if appended:
            d["logs"] = ((d.get("logs") or "") + appended)[-200_000:]
        for key in ("status", "outputs", "state", "error"):
            if payload.get(key) is not None:
                d[key] = payload[key]
    return {"ok": True}
