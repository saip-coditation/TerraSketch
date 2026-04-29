"""Lightweight fixes applied to LLM-generated Terraform before persistence.

Catches recurring model mistakes without re-calling the LLM.
"""

from __future__ import annotations

import re
from typing import Dict, List, Tuple

_PROVIDER_AWS_START = re.compile(r"^\s*provider\s+\"aws\"\s*\{", re.MULTILINE)


def _has_provider_aws_in_providers_tf(providers_tf: str) -> bool:
    return bool(providers_tf and _PROVIDER_AWS_START.search(providers_tf))


def _remove_balanced_block_from(text: str, block_start: int, open_brace_index: int) -> str:
    """Remove from block_start through the closing `}` that matches open_brace_index."""
    depth = 0
    for j in range(open_brace_index, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                end = j + 1
                # Drop one following newline if present
                if end < len(text) and text[end] == "\n":
                    end += 1
                return text[:block_start] + text[end:]
    return text


def _strip_duplicate_provider_aws_from_main(main_tf: str, providers_tf: str) -> Tuple[str, bool]:
    if not main_tf or not _has_provider_aws_in_providers_tf(providers_tf):
        return main_tf, False

    s = main_tf
    changed = False
    while True:
        m = _PROVIDER_AWS_START.search(s)
        if not m:
            break
        open_idx = s.find("{", m.start())
        if open_idx == -1:
            break
        before = s
        s = _remove_balanced_block_from(s, m.start(), open_idx)
        if s != before:
            changed = True
        else:
            break
    s = s.lstrip("\n")
    return s, changed


def postprocess_generated_files(
    files: Dict[str, str],
    *,
    cloud_provider: str,
) -> Tuple[Dict[str, str], List[str]]:
    """Return (possibly updated files, extra assumption strings for transparency)."""
    notes: List[str] = []
    out = dict(files)

    main = out.get("main.tf", "")
    prov = out.get("providers.tf", "")

    if cloud_provider.lower().strip() == "aws":
        new_main, did = _strip_duplicate_provider_aws_from_main(main, prov)
        if did:
            out["main.tf"] = new_main.strip() + ("\n" if new_main.strip() else "")
            notes.append(
                "Post-process: removed duplicate `provider \"aws\"` block(s) from main.tf "
                "(provider should only appear in providers.tf)."
            )

    return out, notes
