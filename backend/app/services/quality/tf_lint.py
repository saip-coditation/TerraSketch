"""Deterministic static lint for generated Terraform.

Unlike ``run_terraform_validate`` (which shells out to the ``terraform`` CLI and
is skipped when the binary/network isn't available — e.g. on the free-tier web
host), this runs pure-Python checks so the Result page ALWAYS has actionable
feedback about the generated HCL. It is intentionally conservative: every rule
is a syntactic/structural check that can't produce false "this won't deploy"
alarms from valid code.

Returns a list of findings, each:
    {"severity": "error"|"warning"|"info", "rule": str, "message": str, "file": str}
"""

from __future__ import annotations

import re

# Resource/variable/output identifiers, e.g. resource "aws_s3_bucket" "site" {
_RESOURCE_RE = re.compile(r'^\s*resource\s+"([^"]+)"\s+"([^"]+)"', re.MULTILINE)
_DATA_RE = re.compile(r'^\s*data\s+"([^"]+)"\s+"([^"]+)"', re.MULTILINE)
_VAR_DECL_RE = re.compile(r'^\s*variable\s+"([^"]+)"', re.MULTILINE)
_VAR_USE_RE = re.compile(r"\bvar\.([A-Za-z_][A-Za-z0-9_]*)")
_REQUIRED_PROVIDERS_RE = re.compile(r"required_providers\s*{")
# A string that is nothing but a single interpolation: "${var.foo}" / "${aws_x.y.id}"
_WHOLE_INTERP_RE = re.compile(r'"\$\{\s*([A-Za-z0-9_.\[\]\-\s]+?)\s*\}"')


def _strip_comments(text: str) -> str:
    """Remove # and // line comments and /* */ block comments so brace counting
    and identifier scans don't trip over commented-out code."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    out_lines = []
    for line in text.splitlines():
        # Drop from the first # or // that isn't inside a string (best-effort).
        in_str = False
        cut = None
        i = 0
        while i < len(line):
            ch = line[i]
            if ch == '"':
                in_str = not in_str
            elif not in_str and ch == "#":
                cut = i
                break
            elif not in_str and ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                cut = i
                break
            i += 1
        out_lines.append(line if cut is None else line[:cut])
    return "\n".join(out_lines)


def _count_unbalanced(text: str) -> dict[str, int]:
    """Count bracket deltas outside of strings. Positive = more opens than closes."""
    pairs = {"{": "}", "(": ")", "[": "]"}
    opens = set(pairs)
    closes = {v: k for k, v in pairs.items()}
    counts = {"{": 0, "(": 0, "[": 0}
    in_str = False
    esc = False
    for ch in text:
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in opens:
            counts[ch] += 1
        elif ch in closes:
            counts[closes[ch]] -= 1
    return counts


def lint_terraform(files: dict[str, str]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    if not files:
        return findings

    tf_files = {n: (b or "") for n, b in files.items() if n.endswith(".tf")}
    if not tf_files:
        return findings

    combined_clean = "\n".join(_strip_comments(b) for b in tf_files.values())

    # ── Per-file structural checks ─────────────────────────────────────────
    for name, body in tf_files.items():
        clean = _strip_comments(body)

        counts = _count_unbalanced(clean)
        labels = {"{": "braces", "(": "parentheses", "[": "brackets"}
        for opener, delta in counts.items():
            if delta != 0:
                kind = "unclosed" if delta > 0 else "extra closing"
                findings.append(
                    {
                        "severity": "error",
                        "rule": "unbalanced-delimiters",
                        "file": name,
                        "message": f"{abs(delta)} {kind} {labels[opener]} — the file won't parse.",
                    }
                )

        # Deprecated whole-string interpolation: "${var.x}" → var.x (TF 0.12+).
        for m in _WHOLE_INTERP_RE.finditer(clean):
            inner = m.group(1).strip()
            # Skip legitimate cases that must stay quoted (heredocs, format strings
            # with surrounding text are not matched by _WHOLE_INTERP_RE anyway).
            findings.append(
                {
                    "severity": "info",
                    "rule": "deprecated-interpolation",
                    "file": name,
                    "message": f'Wrap-only interpolation "${{{inner}}}" can be simplified to {inner}.',
                }
            )

    # ── Duplicate resource / data addresses across all files ───────────────
    seen: dict[str, str] = {}
    for name, body in tf_files.items():
        clean = _strip_comments(body)
        for rx, kind in ((_RESOURCE_RE, "resource"), (_DATA_RE, "data")):
            for m in rx.finditer(clean):
                addr = f"{kind}.{m.group(1)}.{m.group(2)}"
                if addr in seen:
                    findings.append(
                        {
                            "severity": "error",
                            "rule": "duplicate-address",
                            "file": name,
                            "message": f"{addr} is declared more than once "
                            f"(also in {seen[addr]}) — Terraform will reject it.",
                        }
                    )
                else:
                    seen[addr] = name

    # ── Variable declared vs. used (whole config, since all .tf share a dir) ─
    declared = set(_VAR_DECL_RE.findall(combined_clean))
    used = set(_VAR_USE_RE.findall(combined_clean))

    for missing in sorted(used - declared):
        findings.append(
            {
                "severity": "error",
                "rule": "undeclared-variable",
                "file": "variables.tf",
                "message": f'var.{missing} is referenced but no variable "{missing}" block declares it.',
            }
        )
    for unused in sorted(declared - used):
        findings.append(
            {
                "severity": "info",
                "rule": "unused-variable",
                "file": "variables.tf",
                "message": f'variable "{unused}" is declared but never used.',
            }
        )

    # ── required_providers present (pins the AWS provider version) ─────────
    if not _REQUIRED_PROVIDERS_RE.search(combined_clean):
        findings.append(
            {
                "severity": "warning",
                "rule": "missing-required-providers",
                "file": "providers.tf",
                "message": "No required_providers block — the provider version isn't pinned, "
                "so a future major release could break the config.",
            }
        )

    # Stable order: errors first, then warnings, then info.
    order = {"error": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: (order.get(f["severity"], 3), f["file"], f["rule"]))
    return findings
