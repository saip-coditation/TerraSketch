"""Inject a consistent tag set on every AWS resource via provider default_tags.

`default_tags` on the aws provider is applied to all taggable resources without
touching each resource block, so this is a minimal, safe transform: it edits only
the `provider "aws"` block, replacing any existing default_tags it owns.
"""

from __future__ import annotations

import re

# Order matters for stable output.
DEFAULT_TAGS: dict[str, str] = {
    "Project": "terrasketch",
    "Environment": "dev",
    "ManagedBy": "TerraSketch",
    "CostCenter": "engineering",
}

_PROVIDER_RE = re.compile(r'provider\s+"aws"\s*{')
_DEFAULT_TAGS_RE = re.compile(r"default_tags\s*{")


def _matching_brace(text: str, open_idx: int) -> int:
    """Index of the '}' matching the '{' at open_idx (which must be a '{')."""
    depth = 0
    in_str = False
    esc = False
    for i in range(open_idx, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
    return -1


def _render_default_tags(tags: dict[str, str], indent: str = "  ") -> str:
    keys = list(tags.keys())
    width = max((len(k) for k in keys), default=0)
    lines = [f"{indent}default_tags {{", f"{indent}  tags = {{"]
    for k in keys:
        val = str(tags[k]).replace('"', '\\"')
        lines.append(f'{indent}    {k.ljust(width)} = "{val}"')
    lines.append(f"{indent}  }}")
    lines.append(f"{indent}}}")
    return "\n".join(lines)


def _inject_into_text(text: str, tags: dict[str, str]) -> tuple[str, bool]:
    m = _PROVIDER_RE.search(text)
    if not m:
        return text, False
    body_open = text.index("{", m.start())
    body_close = _matching_brace(text, body_open)
    if body_close < 0:
        return text, False

    inner = text[body_open + 1 : body_close]

    # Drop any default_tags block the provider already has, so we don't stack them.
    dm = _DEFAULT_TAGS_RE.search(inner)
    if dm:
        dt_open = inner.index("{", dm.start())
        dt_close = _matching_brace(inner, dt_open)
        if dt_close >= 0:
            inner = (inner[: dm.start()] + inner[dt_close + 1 :]).rstrip() + "\n"

    inner = inner.rstrip("\n")
    block = _render_default_tags(tags)
    new_inner = f"{inner}\n\n{block}\n"
    new_text = text[: body_open + 1] + new_inner + text[body_close:]
    return new_text, True


def inject_default_tags(
    files: dict[str, str], tags: dict[str, str] | None = None
) -> tuple[dict[str, str], list[str]]:
    """Return (new_files, notes). Adds/updates default_tags on the aws provider,
    wherever that provider block lives (providers.tf or main.tf)."""
    tag_set = {**DEFAULT_TAGS, **(tags or {})}
    new_files = dict(files)
    for name, body in files.items():
        if not name.endswith(".tf"):
            continue
        updated, changed = _inject_into_text(body or "", tag_set)
        if changed:
            new_files[name] = updated
            applied = ", ".join(f"{k}={v}" for k, v in tag_set.items())
            return new_files, [f"Applied default_tags to the AWS provider ({applied})."]
    return new_files, [
        'No provider "aws" block found, so no tags were applied. '
        "Add a provider block first, then re-apply."
    ]
