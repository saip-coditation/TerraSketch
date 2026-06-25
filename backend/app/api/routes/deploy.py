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

import re
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


def example_tfvars(variables_tf: str, region: str) -> str:
    """Generate example values for variables that have no default (else apply fails)."""
    suffix = uuid.uuid4().hex[:6]
    lines = []
    for name, body in _var_blocks(variables_tf):
        if re.search(r"(^|\n)\s*default\s*=", body):
            continue  # already has a default — leave it
        lines.append(f"{name} = {_example_value(name, body, region, suffix)}")
    return ("\n".join(lines) + "\n") if lines else ""


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

    # Fill any required (no-default) variables with example values so apply
    # doesn't fail on "No value for required variable".
    tfvars = example_tfvars(files.get("variables.tf", ""), payload.region)
    if tfvars:
        files = {**files, "terraform.auto.tfvars": tfvars}

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
