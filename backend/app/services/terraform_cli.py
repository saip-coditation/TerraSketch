"""Optional terraform fmt/validate in a temp directory (requires terraform CLI + network for init)."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict


def run_terraform_validate(files: Dict[str, str]) -> Dict[str, Any]:
    """Run terraform init (no backend) and validate. Returns a JSON-serializable dict."""
    if not shutil.which("terraform"):
        return {
            "skipped": True,
            "reason": "terraform CLI not found in PATH",
        }

    required = ("main.tf", "variables.tf", "outputs.tf", "providers.tf")
    if not all(files.get(n) for n in required):
        return {
            "skipped": True,
            "reason": "missing one or more required .tf files",
        }

    try:
        with tempfile.TemporaryDirectory(prefix="terrasketch-tf-") as tmp:
            root = Path(tmp)
            for name in required:
                (root / name).write_text(files[name], encoding="utf-8")
            env = {**os.environ, "TF_INPUT": "0"}
            init = subprocess.run(
                ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=120,
                env=env,
            )
            if init.returncode != 0:
                return {
                    "valid": False,
                    "step": "init",
                    "stdout": (init.stdout or "")[-8000:],
                    "stderr": (init.stderr or "")[-8000:],
                }
            val = subprocess.run(
                ["terraform", "validate", "-no-color"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=60,
                env=env,
            )
            return {
                "valid": val.returncode == 0,
                "step": "validate",
                "stdout": (val.stdout or "")[-4000:],
                "stderr": (val.stderr or "")[-4000:],
            }
    except subprocess.TimeoutExpired:
        return {"valid": False, "step": "timeout", "stderr": "terraform command timed out"}
    except Exception as exc:
        return {"valid": False, "step": "error", "stderr": str(exc)}


def run_terraform_fmt_check(files: Dict[str, str]) -> Dict[str, Any]:
    if not shutil.which("terraform"):
        return {"skipped": True, "reason": "terraform CLI not found in PATH"}
    try:
        with tempfile.TemporaryDirectory(prefix="terrasketch-fmt-") as tmp:
            root = Path(tmp)
            for name, body in files.items():
                if name.endswith(".tf"):
                    (root / name).write_text(body, encoding="utf-8")
            fmt = subprocess.run(
                ["terraform", "fmt", "-check", "-recursive", "."],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return {
                "formatted_ok": fmt.returncode == 0,
                "stderr": (fmt.stderr or "")[-2000:],
            }
    except Exception as exc:
        return {"formatted_ok": False, "stderr": str(exc)}
