"""Lightweight heuristics to flag possible secrets in generated Terraform."""

from __future__ import annotations

import re
from typing import Dict, List

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Possible Anthropic-style API key", re.compile(r"sk-ant-api[a-zA-Z0-9_-]{10,}")),
    ("Possible Google API key", re.compile(r"AIza[0-9A-Za-z_-]{30,}")),
    ("Possible generic long secret in string", re.compile(r'=\s*"[a-zA-Z0-9+/=]{40,}"')),
    ("Possible AWS secret access key-like value", re.compile(r'=\s*"[A-Za-z0-9/+=]{40}"')),
]


def scan_generated_files(files: Dict[str, str]) -> List[str]:
    warnings: list[str] = []
    seen: set[str] = set()
    for path, content in files.items():
        if not content:
            continue
        lower = content.lower()
        for label, rx in _PATTERNS:
            if rx.search(content):
                key = f"{label}:{path}"
                if key not in seen:
                    seen.add(key)
                    warnings.append(f"{label} (check {path}) — rotate any real credential and use variables.")
        if "password" in lower and re.search(r'password\s*=\s*"[^"]{8,}"', content):
            key = f"hardcoded-password:{path}"
            if key not in seen:
                seen.add(key)
                warnings.append(
                    f"Possible hardcoded password in {path} — prefer variables and a secrets manager."
                )
    return warnings[:12]
