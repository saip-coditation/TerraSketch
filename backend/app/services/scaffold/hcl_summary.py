"""Small regex extractors for building docs/tfvars from generated HCL.

Deliberately lightweight (no full HCL parse) and tolerant of odd formatting —
used only for read-only documentation, never to rewrite code.
"""

from __future__ import annotations

import re

_RESOURCE_RE = re.compile(r'^\s*resource\s+"([^"]+)"\s+"([^"]+)"', re.MULTILINE)
_DATA_RE = re.compile(r'^\s*data\s+"([^"]+)"\s+"([^"]+)"', re.MULTILINE)
_VAR_RE = re.compile(r'variable\s+"([^"]+)"\s*{', re.MULTILINE)
_OUTPUT_RE = re.compile(r'output\s+"([^"]+)"\s*{', re.MULTILINE)


def _matching_brace(text: str, open_idx: int) -> int:
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


def _all_tf(files: dict[str, str]) -> str:
    return "\n".join(b or "" for n, b in files.items() if n.endswith(".tf"))


def resources(files: dict[str, str]) -> list[tuple[str, str]]:
    """[(type, name), ...] for resource blocks, sorted, de-duped."""
    blob = _all_tf(files)
    seen = sorted({(m.group(1), m.group(2)) for m in _RESOURCE_RE.finditer(blob)})
    return seen


def data_sources(files: dict[str, str]) -> list[tuple[str, str]]:
    blob = _all_tf(files)
    return sorted({(m.group(1), m.group(2)) for m in _DATA_RE.finditer(blob)})


def _read_hcl_value(text: str, i: int) -> str | None:
    """Read exactly one HCL value starting at/after index i: a quoted string, a
    balanced [ ] / { } / ( ) expression (possibly multi-line), or a bare token.
    Stops at the value boundary so single-line `default="x" description="y"` reads
    only "x"."""
    n = len(text)
    while i < n and text[i] in " \t":
        i += 1
    if i >= n:
        return None
    c = text[i]
    if c == '"':
        j = i + 1
        while j < n:
            if text[j] == "\\":
                j += 2
                continue
            if text[j] == '"':
                j += 1
                break
            j += 1
        return text[i:j].strip()
    if c in "[{(":
        depth = 0
        in_str = False
        esc = False
        j = i
        while j < n:
            ch = text[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch in "[{(":
                depth += 1
            elif ch in "]})":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        return text[i:j].strip()
    j = i
    while j < n and text[j] not in " \t\n#,":
        j += 1
    return text[i:j].strip() or None


def _extract_attr(body: str, attr: str) -> str | None:
    # For default/type keep the RAW value (quotes and all) so it stays valid HCL
    # when dropped into tfvars, e.g. default = "us-east-1".
    if attr in ("default", "type"):
        m = re.search(rf"\b{attr}\s*=", body)
        return _read_hcl_value(body, m.end()) if m else None
    # description = "..."   (double-quoted, allowing escaped quotes)
    m = re.search(rf'{attr}\s*=\s*"((?:[^"\\]|\\.)*)"', body)
    return m.group(1) if m else None


def _blocks(files: dict[str, str], name_re: re.Pattern) -> list[tuple[str, str]]:
    """Return [(name, body_text), ...] for variable/output blocks."""
    out: list[tuple[str, str]] = []
    for _, body in files.items():
        if not body:
            continue
        for m in name_re.finditer(body):
            open_idx = body.index("{", m.start())
            close_idx = _matching_brace(body, open_idx)
            if close_idx < 0:
                continue
            out.append((m.group(1), body[open_idx + 1 : close_idx]))
    return out


def variables(files: dict[str, str]) -> list[dict[str, str | None]]:
    result = []
    for name, body in _blocks(files, _VAR_RE):
        result.append(
            {
                "name": name,
                "type": _extract_attr(body, "type"),
                "default": _extract_attr(body, "default"),
                "description": _extract_attr(body, "description"),
            }
        )
    result.sort(key=lambda v: v["name"])
    return result


def outputs(files: dict[str, str]) -> list[dict[str, str | None]]:
    result = []
    for name, body in _blocks(files, _OUTPUT_RE):
        result.append({"name": name, "description": _extract_attr(body, "description")})
    result.sort(key=lambda v: v["name"])
    return result
