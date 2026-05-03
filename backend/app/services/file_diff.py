"""Simple file-level diff summaries between two Terraform bundles."""

from __future__ import annotations

from typing import Any, Dict


def summarize_file_diffs(
    old_files: Dict[str, str] | None,
    new_files: Dict[str, str],
) -> Dict[str, Any]:
    if not old_files:
        return {}
    summary: dict[str, dict[str, Any]] = {}
    names = sorted(set(old_files) | set(new_files))
    for name in names:
        o = old_files.get(name, "")
        n = new_files.get(name, "")
        if o == n:
            continue
        o_lines = len(o.splitlines()) if o else 0
        n_lines = len(n.splitlines()) if n else 0
        summary[name] = {
            "status": "removed" if name not in new_files else "added" if name not in old_files else "changed",
            "lines_before": o_lines,
            "lines_after": n_lines,
            "delta_lines": n_lines - o_lines,
        }
    return summary
