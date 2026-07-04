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


def _capture(cmd: list, cwd, env) -> tuple:
    """Run a command and return (returncode, combined output) without streaming."""
    try:
        p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=120)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as exc:  # noqa: BLE001
        return 1, str(exc)


def request_fix(files: dict, error: str):
    """Ask the backend to repair the files given a terraform error. Returns files or None."""
    try:
        r = _session.post(
            f"{BACKEND_URL}/api/worker/fix",
            json={"files": files, "error": error[-6000:]},
            timeout=200,
        )
        if r.status_code == 200:
            return r.json().get("files")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] fix request failed: {exc}", file=sys.stderr)
    return None


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

    # Write the Terraform files (incl. *.auto.tfvars), and prior state for destroy/re-apply.
    for name, content in (job.get("files") or {}).items():
        if name.endswith((".tf", ".tfvars")):
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

    def stream(cmd: list):
        """Run a command, streaming scrubbed output; returns (returncode, full output)."""
        post_update(job_id, log_append=f"\n$ {' '.join(cmd)}\n")
        proc = subprocess.Popen(
            cmd, cwd=workdir, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
        collected: list[str] = []
        buffer: list[str] = []
        for line in proc.stdout:  # type: ignore[union-attr]
            s = scrub(line)
            collected.append(s)
            buffer.append(s)
            if len(buffer) >= 10:
                post_update(job_id, log_append="".join(buffer))
                buffer = []
        if buffer:
            post_update(job_id, log_append="".join(buffer))
        return proc.wait(), "".join(collected)

    def read_state():
        p = workdir / "terraform.tfstate"
        return p.read_text(encoding="utf-8") if p.exists() else None

    def rewrite(f: dict):
        for name, content in f.items():
            if name.endswith((".tf", ".tfvars")):
                (workdir / name).write_text(content or "", encoding="utf-8")

    post_update(job_id, status="running", log_append=f"$ starting terraform {action}\n")
    files = {k: v for k, v in (job.get("files") or {}).items() if k.endswith((".tf", ".tfvars"))}

    # 1. init. A config *syntax* error (e.g. an unclosed `list(string`) fails
    #    init before validate can run, so on failure ask the AI to repair the
    #    config and re-init before giving up — otherwise the job dead-ends here.
    rc, output = stream(["terraform", "init", "-no-color", "-input=false"])
    for _ in range(2):
        if rc == 0:
            break
        post_update(job_id, log_append="[init failed — asking AI to fix config…]\n")
        fixed = request_fix(files, output)
        if not fixed or fixed == files:
            break
        files = fixed
        rewrite(files)
        rc, output = stream(["terraform", "init", "-no-color", "-input=false"])
    if rc != 0:
        post_update(job_id, status="error", error="terraform init failed", files=files)
        return

    # 2. validate → AI-fix loop. Config must be valid for BOTH apply and destroy
    #    (destroy needs a parseable config even though it tears down from state).
    for attempt in range(3):
        rc, output = _capture(["terraform", "validate", "-no-color"], workdir, env)
        post_update(job_id, log_append=scrub(f"\n$ terraform validate\n{output}\n"))
        if rc == 0:
            break
        if attempt == 2:
            post_update(job_id, log_append="[validate still failing after fixes — continuing anyway]\n")
            break
        post_update(job_id, log_append="[validate failed — asking AI to fix…]\n")
        fixed = request_fix(files, output)
        if not fixed or fixed == files:
            post_update(job_id, log_append="[no fix produced — continuing]\n")
            break
        files = fixed
        rewrite(files)
        # A fix may introduce a new provider (e.g. random) — re-init so the lock
        # file stays consistent, otherwise apply fails on "Inconsistent dependency lock file".
        stream(["terraform", "init", "-upgrade", "-no-color", "-input=false"])

    # Destroy: config is now valid → tear down using the saved state.
    if action == "destroy":
        rc, _ = stream(["terraform", "destroy", "-auto-approve", "-no-color"])
        if rc == 0:
            post_update(job_id, status="destroyed", state=read_state(), files=files, log_append="\n✓ destroy complete\n")
        else:
            post_update(job_id, status="error", error="terraform destroy failed", state=read_state(), files=files)
        return

    # 3. apply. First failure → a plain retry (many AWS errors are transient:
    #    IAM/instance-profile propagation, eventual consistency, throttling).
    #    Only if it still fails do we ask the AI to fix (avoids needless churn).
    #    State is saved after every attempt so partial resources are destroyable.
    for attempt in range(4):
        rc, output = stream(["terraform", "apply", "-auto-approve", "-no-color"])
        state = read_state()
        if rc == 0:
            outputs = {}
            try:
                o = subprocess.run(
                    ["terraform", "output", "-json"], cwd=workdir, env=env,
                    capture_output=True, text=True, timeout=60,
                )
                if o.returncode == 0 and o.stdout.strip():
                    outputs = json.loads(o.stdout)
            except Exception:  # noqa: BLE001
                pass
            post_update(job_id, status="applied", outputs=outputs, state=state, files=files, log_append="\n✓ apply complete\n")
            return
        # apply failed — persist partial state + current files so destroy uses the same (fixed) config
        post_update(job_id, state=state, files=files)
        if attempt == 3:
            post_update(job_id, status="error", error="terraform apply failed", state=state, files=files,
                        log_append="\n[apply still failing after fixes — any partial resources are saved; use Destroy to clean up]\n")
            return
        if attempt == 0:
            # First failure: retry as-is (transient issues usually clear on retry).
            post_update(job_id, log_append="\n[apply failed — retrying in 15s (transient AWS issues usually clear on retry)…]\n")
            time.sleep(15)
            continue
        post_update(job_id, log_append="\n[apply failed — asking AI to fix…]\n")
        fixed = request_fix(files, output)
        if not fixed or fixed == files:
            post_update(job_id, status="error", error="terraform apply failed", state=state, files=files)
            return
        files = fixed
        rewrite(files)
        # A fix may introduce a new provider (e.g. random) — re-init so the lock
        # file stays consistent, otherwise apply fails on "Inconsistent dependency lock file".
        stream(["terraform", "init", "-upgrade", "-no-color", "-input=false"])


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
