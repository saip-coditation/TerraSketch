"""Build a ready-to-push repo zip: .tf files + README + .gitignore + example
tfvars + CI workflow. In-memory, deterministic."""

from __future__ import annotations

import io
import zipfile

from app.services.scaffold import docs


def build_zip(
    *,
    files: dict[str, str],
    cloud_provider: str = "aws",
    environment: str = "dev",
    resources_identified: list[str] | None = None,
    diagram_match_percent: int | None = None,
) -> bytes:
    readme = docs.build_readme(
        files=files,
        cloud_provider=cloud_provider,
        environment=environment,
        resources_identified=resources_identified,
        diagram_match_percent=diagram_match_percent,
    )
    tfvars = docs.build_example_tfvars(files)

    members: dict[str, str] = {}
    for name, body in files.items():
        if name.endswith(".tf"):
            members[name] = body or ""
    members["README.md"] = readme
    members[".gitignore"] = docs.GITIGNORE
    members["terraform.tfvars.example"] = tfvars
    members[docs.CI_WORKFLOW_PATH] = docs.CI_WORKFLOW

    buf = io.BytesIO()
    # Fixed timestamp keeps the archive byte-stable across runs.
    fixed = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(members):
            info = zipfile.ZipInfo(filename=name, date_time=fixed)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, members[name])
    return buf.getvalue()
