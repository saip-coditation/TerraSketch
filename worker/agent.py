#!/usr/bin/env python3
"""TerraSketch Terraform worker agent.

Runs on a small AWS box (e.g. a free-tier t3.micro). Polls the TerraSketch
backend for deploy jobs, runs `terraform apply`/`destroy` using the *user's*
transient AWS credentials (passed per job, never persisted), streams logs back,
and returns the resulting state + outputs.

The box this runs on can live in any AWS account — the account that Terraform
deploys INTO is decided entirely by the credentials in each job.

Config via environment variables:
  BACKEND_URL     e.g. https://terrasketch.onrender.com   (required)
  WORKER_TOKEN    shared secret; must match the backend     (required)
  POLL_INTERVAL   seconds between polls (default 5)
  WORK_ROOT       scratch dir (default /tmp/terrasketch-jobs)

Backend contract (built on the app side):
  GET  {BACKEND_URL}/api/worker/next-job
       -> 204 when idle, or 200 with:
       { id, action: "apply"|"destroy", region,
         files: { "main.tf": "...", ... }, state: "<tfstate json|null>",
         aws_access_key_id, aws_secret_access_key, aws_session_token? }
  POST {BACKEND_URL}/api/worker/jobs/{id}
       { status?, log_append?, outputs?, state?, error? }
  Both authenticated with header: Authorization: Bearer <WORKER_TOKEN>
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import requests

BACKEND_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))
WORK_ROOT = Path(os.environ.get("WORK_ROOT", "/tmp/terrasketch-jobs"))
HTTP_TIMEOUT = 30

_session = requests.Session()
_session.headers.update({"Authorization": f"Bearer {WORKER_TOKEN}"})


def _scrubber(secrets: list[str]):
    real = [s for s in secrets if s]
    def scrub(text: str) -> str:
        for s in real:
            if s:
                text = text.replace(s, "***REDACTED***")
        return text
    return scrub


def post_update(job_id: str, **fields) -> None:
    """Send a status/log update; best-effort (never crash the run over a flaky POST)."""
    try:
        _session.post(f"{BACKEND_URL}/api/worker/jobs/{job_id}", json=fields, timeout=HTTP_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] update POST failed: {exc}", file=sys.stderr)


def run_terraform(job: dict) -> None:
    job_id = job["id"]
    action = job.get("action", "apply")
    scrub = _scrubber([
        job.get("aws_access_key_id", ""),
        job.get("aws_secret_access_key", ""),
        job.get("aws_session_token", ""),
    ])

    workdir = WORK_ROOT / job_id
    if workdir.exists():
        shutil.rmtree(workdir, ignore_errors=True)
    workdir.mkdir(parents=True, exist_ok=True)

    # Write the Terraform files, and prior state for destroy/re-apply.
    for name, content in (job.get("files") or {}).items():
        if name.endswith(".tf"):
            (workdir / name).write_text(content or "", encoding="utf-8")
    if job.get("state"):
        (workdir / "terraform.tfstate").write_text(job["state"], encoding="utf-8")

    # The user's transient creds — env only, never written to disk.
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", "/root"),
        "AWS_ACCESS_KEY_ID": job.get("aws_access_key_id", ""),
        "AWS_SECRET_ACCESS_KEY": job.get("aws_secret_access_key", ""),
        "AWS_DEFAULT_REGION": job.get("region", "us-east-1"),
        "TF_IN_AUTOMATION": "1",
        "TF_INPUT": "0",
    }
    if job.get("aws_session_token"):
        env["AWS_SESSION_TOKEN"] = job["aws_session_token"]

    apply_cmd = (
        ["terraform", "destroy", "-auto-approve", "-no-color"]
        if action == "destroy"
        else ["terraform", "apply", "-auto-approve", "-no-color"]
    )
    steps = [["terraform", "init", "-no-color", "-input=false"], apply_cmd]

    post_update(job_id, status="running", log_append=f"$ starting terraform {action}\n")

    for cmd in steps:
        post_update(job_id, log_append=f"\n$ {' '.join(cmd)}\n")
        proc = subprocess.Popen(
            cmd, cwd=workdir, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
        buffer: list[str] = []
        for line in proc.stdout:  # type: ignore[union-attr]
            buffer.append(scrub(line))
            if len(buffer) >= 10:
                post_update(job_id, log_append="".join(buffer))
                buffer = []
        if buffer:
            post_update(job_id, log_append="".join(buffer))
        code = proc.wait()
        if code != 0:
            post_update(job_id, status="error", error=f"`{' '.join(cmd)}` exited {code}")
            return

    if action == "destroy":
        post_update(job_id, status="destroyed", log_append="\n✓ destroy complete\n")
        return

    # Collect outputs + final state for a successful apply.
    outputs = {}
    try:
        out = subprocess.run(
            ["terraform", "output", "-json"], cwd=workdir, env=env,
            capture_output=True, text=True, timeout=60,
        )
        if out.returncode == 0 and out.stdout.strip():
            outputs = json.loads(out.stdout)
    except Exception:  # noqa: BLE001
        pass

    state_path = workdir / "terraform.tfstate"
    state = state_path.read_text(encoding="utf-8") if state_path.exists() else None

    post_update(job_id, status="applied", outputs=outputs, state=state, log_append="\n✓ apply complete\n")


def poll_once() -> bool:
    """Return True if a job was processed."""
    try:
        resp = _session.get(f"{BACKEND_URL}/api/worker/next-job", timeout=HTTP_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] poll failed: {exc}", file=sys.stderr)
        return False

    if resp.status_code == 204 or not resp.content:
        return False
    if resp.status_code != 200:
        print(f"[warn] next-job returned {resp.status_code}", file=sys.stderr)
        return False

    job = resp.json()
    print(f"[info] picked up job {job.get('id')} ({job.get('action')})")
    try:
        run_terraform(job)
    except Exception as exc:  # noqa: BLE001
        post_update(job.get("id", ""), status="error", error=str(exc))
    finally:
        shutil.rmtree(WORK_ROOT / str(job.get("id", "")), ignore_errors=True)
    return True


def main() -> None:
    if not BACKEND_URL or not WORKER_TOKEN:
        print("BACKEND_URL and WORKER_TOKEN must be set", file=sys.stderr)
        sys.exit(1)
    if not shutil.which("terraform"):
        print("terraform CLI not found in PATH", file=sys.stderr)
        sys.exit(1)
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"[info] TerraSketch worker started → {BACKEND_URL} (poll {POLL_INTERVAL}s)")
    while True:
        worked = poll_once()
        if not worked:
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
