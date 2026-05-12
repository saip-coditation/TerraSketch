"""Validate-and-fix: agentic loop wrapping `terraform validate`.

V1 fix: fixer sees ResourcePlan so it can't silently delete required resources.
V2 fix: structural diff after each fix detects architecture drift.
V3 fix: prior iteration decisions are passed to next call for learning.
V4 fix: valid=None means skipped (distinguishable from valid=False = real failure).
V5 fix: terraform validate output parsed into structured ValidationError list.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool
from app.agents.prompts import FIXER_SYSTEM
from app.agents.state import (
    Decision,
    GraphState,
    NodeOutput,
    TerraformFiles,
    ValidationError,
    ValidationReport,
)
from app.agents.tools import SUBMIT_TERRAFORM
from app.core.config import get_settings
from app.services.terraform.cli import run_terraform_validate


def _max_fix_iterations() -> int:
    return get_settings().AGENT_MAX_FIX_ITERATIONS


async def _validate(files: TerraformFiles) -> dict[str, Any]:
    return await asyncio.to_thread(run_terraform_validate, files.as_dict())


def _parse_tf_errors(report: dict[str, Any]) -> list[ValidationError]:
    """Parse terraform validate stderr into structured errors."""
    errors: list[ValidationError] = []
    raw = " ".join(
        filter(None, [report.get("stderr", ""), report.get("stdout", "")])
    )
    # Match lines like: │ on main.tf line 42, in resource "aws_vpc" "main":
    file_line_re = re.compile(r"on (\S+\.tf) line (\d+)")
    # Match lines like: Error: Missing required argument
    error_re = re.compile(r"Error: (.+)")
    current_file: str | None = None
    current_line: int | None = None
    for line in raw.splitlines():
        fl = file_line_re.search(line)
        if fl:
            current_file = fl.group(1)
            current_line = int(fl.group(2))
        em = error_re.search(line)
        if em:
            errors.append(ValidationError(
                file=current_file,
                line=current_line,
                message=em.group(1).strip(),
            ))
            current_file = None
            current_line = None
    if not errors and raw.strip():
        # Fallback: return the whole blob as a single error
        errors.append(ValidationError(message=raw.strip()[:2000]))
    return errors


def _format_errors(report: dict[str, Any]) -> str:
    parts = []
    for key in ("stderr", "stdout"):
        chunk = (report.get(key) or "").strip()
        if chunk:
            parts.append(f"--- {key} ---\n{chunk}")
    return "\n\n".join(parts) or "(no output captured)"


def _resource_type_counts(files: TerraformFiles) -> dict[str, int]:
    """Count occurrences of each resource type in main.tf for drift detection."""
    counts: dict[str, int] = {}
    for m in re.finditer(r'^resource\s+"([^"]+)"', files.main_tf, re.MULTILINE):
        rtype = m.group(1)
        counts[rtype] = counts.get(rtype, 0) + 1
    return counts


async def _run_fixer(
    state: GraphState,
    errors: str,
    iteration: int,
    prior_decisions: list[Decision],
) -> NodeOutput:
    assert state.files is not None
    started = time.perf_counter()

    prior_reasoning = state.trace.synthesize.reasoning if state.trace.synthesize else ""
    plan_json = (
        state.resource_plan.model_dump_json(indent=2)
        if state.resource_plan
        else "(not available)"
    )

    # V3: include prior iteration decisions so fixer learns what was tried
    prior_iter_summary = ""
    if prior_decisions:
        lines = [f"  - {d.choice}" for d in prior_decisions]
        prior_iter_summary = "\nPrior iteration fixes attempted:\n" + "\n".join(lines) + "\n"

    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Iteration: {iteration}/{_max_fix_iterations()}\n\n"
        f"ResourcePlan (DO NOT add or remove resources not listed here):\n{plan_json}\n\n"
        f"Prior synthesis reasoning:\n{prior_reasoning}\n"
        f"{prior_iter_summary}\n"
        "Current files:\n"
        f"--- main.tf ---\n{state.files.main_tf}\n\n"
        f"--- variables.tf ---\n{state.files.variables_tf}\n\n"
        f"--- outputs.tf ---\n{state.files.outputs_tf}\n\n"
        f"--- providers.tf ---\n{state.files.providers_tf}\n\n"
        f"Validation errors to fix:\n{errors}"
    )

    result = await call_tool(
        system_prompt=FIXER_SYSTEM,
        user_content=[{"type": "text", "text": user_text}],
        tool=SUBMIT_TERRAFORM,
    )

    state.files = TerraformFiles(
        **{
            "main.tf": result["main_tf"],
            "variables.tf": result["variables_tf"],
            "outputs.tf": result["outputs_tf"],
            "providers.tf": result["providers_tf"],
        }
    )
    return NodeOutput(
        node="fixer",
        reasoning=str(result.get("reasoning", "")),
        confidence=float(result.get("confidence", 0.5)),
        decisions=[Decision(**d) for d in result.get("decisions", []) or []],
        iteration=iteration,
        duration_ms=int((time.perf_counter() - started) * 1000),
        input_tokens=result.pop("_input_tokens", 0),
        output_tokens=result.pop("_output_tokens", 0),
    )


async def run_validate_fix(state: GraphState) -> GraphState:
    if state.files is None:
        raise AgentLLMError("Validate node requires files to be set (run synthesize first).")

    # V2: track baseline resource counts for drift detection
    baseline_counts = _resource_type_counts(state.files) if state.resource_plan else {}

    started = time.perf_counter()
    iteration = 0
    accumulated_decisions: list[Decision] = []

    while True:
        report = await _validate(state.files)

        if report.get("skipped"):
            state.validation = ValidationReport(
                valid=None,  # V4: None = skipped, not the same as False = failed
                iterations=iteration,
                skipped=True,
                skip_reason=str(report.get("reason") or "skipped"),
            )
            state.trace.validate_node = NodeOutput(
                node="validate",
                reasoning=f"terraform CLI unavailable: {report.get('reason')}. Skipped.",
                confidence=0.0,
                iteration=iteration,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
            return state

        if report.get("valid"):
            state.validation = ValidationReport(
                valid=True,
                iterations=iteration,
            )
            state.trace.validate_node = NodeOutput(
                node="validate",
                reasoning=(
                    "Validated on first try."
                    if iteration == 0
                    else f"Validated after {iteration} fix iteration(s)."
                ),
                confidence=1.0,
                iteration=iteration,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
            return state

        if iteration >= _max_fix_iterations():
            errors_text = _format_errors(report)
            parsed_errors = _parse_tf_errors(report)
            state.validation = ValidationReport(
                valid=False,
                iterations=iteration,
                errors=parsed_errors,
                final_errors=errors_text,
            )
            state.trace.validate_node = NodeOutput(
                node="validate",
                reasoning=f"Could not fix in {_max_fix_iterations()} iterations. Returning last attempt.",
                confidence=0.0,
                iteration=iteration,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
            return state

        iteration += 1
        fix_node = await _run_fixer(
            state,
            _format_errors(report),
            iteration,
            prior_decisions=accumulated_decisions,
        )
        accumulated_decisions.extend(fix_node.decisions)
        state.trace.fixer_iterations.append(fix_node)

        # V2: structural drift check — warn if resource types changed
        if baseline_counts:
            new_counts = _resource_type_counts(state.files)
            added = {k for k in new_counts if k not in baseline_counts}
            removed = {k for k in baseline_counts if k not in new_counts}
            if added or removed:
                import logging
                logging.getLogger(__name__).warning(
                    "Fixer iter %d: resource type drift — added=%s removed=%s",
                    iteration,
                    added,
                    removed,
                )
