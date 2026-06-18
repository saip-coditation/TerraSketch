"""Live cost breakdown via the Infracost CLI.

Runs `infracost breakdown` over the generated Terraform to get real
cloud-pricing-API numbers. Degrades gracefully: if the `infracost` binary
isn't installed or INFRACOST_API_KEY isn't set, returns {"available": False}
so callers can fall back to the client-side code-grounded estimate.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def _to_float(value: Any) -> float:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


def run_infracost(files: dict[str, str]) -> dict[str, Any]:
    """Return a structured monthly cost breakdown, or {"available": False, ...}."""
    settings = get_settings()

    if not shutil.which("infracost"):
        return {"available": False, "reason": "infracost CLI not installed"}
    if not settings.INFRACOST_API_KEY:
        return {"available": False, "reason": "INFRACOST_API_KEY not configured"}

    tf_files = {name: body for name, body in (files or {}).items() if name.endswith(".tf") and body}
    if not tf_files:
        return {"available": False, "reason": "no Terraform files to price"}

    try:
        with tempfile.TemporaryDirectory(prefix="terrasketch-cost-") as tmp:
            root = Path(tmp)
            for name, body in tf_files.items():
                (root / name).write_text(body, encoding="utf-8")

            env = {
                "PATH": os.environ.get("PATH", ""),
                "HOME": os.environ.get("HOME", ""),
                "INFRACOST_API_KEY": settings.INFRACOST_API_KEY,
                "INFRACOST_SKIP_UPDATE_CHECK": "true",
            }
            proc = subprocess.run(
                ["infracost", "breakdown", "--path", ".", "--format", "json", "--no-color"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=120,
                env=env,
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                return {
                    "available": False,
                    "reason": "infracost breakdown failed",
                    "detail": (proc.stderr or "")[-2000:],
                }

            data = json.loads(proc.stdout)
    except subprocess.TimeoutExpired:
        return {"available": False, "reason": "infracost timed out"}
    except Exception as exc:  # noqa: BLE001 — never break the caller over cost
        return {"available": False, "reason": f"infracost error: {exc}"}

    items: list[dict[str, Any]] = []
    for project in data.get("projects") or []:
        breakdown = project.get("breakdown") or {}
        for res in breakdown.get("resources") or []:
            monthly = _to_float(res.get("monthlyCost"))
            items.append({"name": res.get("name", "resource"), "monthly": monthly})

    items.sort(key=lambda i: i["monthly"], reverse=True)

    return {
        "available": True,
        "currency": data.get("currency", "USD"),
        "total_monthly": _to_float(data.get("totalMonthlyCost")),
        "items": items,
    }
