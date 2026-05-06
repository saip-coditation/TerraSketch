"""Validate-and-fix: agentic loop wrapping `terraform validate`.

If validate fails, send the errors back to a fixer agent, replace files,
re-run validate. Up to N iterations. Every iteration emits its own
NodeOutput into trace.fixer_iterations so debugging is one query away.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from app.agents.llm import AgentLLMError, call_tool
from app.agents.prompts import FIXER_SYSTEM
from app.agents.state import (
    Decision,
    GraphState,
    NodeOutput,
    TerraformFiles,
    ValidationReport,
)
from app.agents.tools import SUBMIT_TERRAFORM
from app.services.terraform.cli import run_terraform_validate

MAX_FIX_ITERATIONS = 3


async def _validate(files: TerraformFiles) -> dict[str, Any]:
    return await asyncio.to_thread(run_terraform_validate, files.as_dict())


def _format_errors(report: dict[str, Any]) -> str:
    parts = []
    for key in ("stderr", "stdout"):
        chunk = (report.get(key) or "").strip()
        if chunk:
            parts.append(f"--- {key} ---\n{chunk}")
    return "\n\n".join(parts) or "(no output captured)"


async def _run_fixer(
    state: GraphState,
    errors: str,
    iteration: int,
) -> NodeOutput:
    assert state.files is not None
    started = time.perf_counter()
    prior_reasoning = state.trace.synthesize.reasoning if state.trace.synthesize else ""
    user_text = (
        f"Cloud provider: {state.cloud_provider}\n"
        f"Iteration: {iteration}/{MAX_FIX_ITERATIONS}\n\n"
        f"Prior synthesis reasoning:\n{prior_reasoning}\n\n"
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
    )


async def run_validate_fix(state: GraphState) -> GraphState:
    if state.files is None:
        raise AgentLLMError("Validate node requires files to be set (run synthesize first).")

    started = time.perf_counter()
    iteration = 0

    while True:
        report = await _validate(state.files)

        if report.get("skipped"):
            state.validation = ValidationReport(
                valid=False,
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
            state.validation = ValidationReport(valid=True, iterations=iteration)
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

        if iteration >= MAX_FIX_ITERATIONS:
            errors = _format_errors(report)
            state.validation = ValidationReport(
                valid=False,
                iterations=iteration,
                final_errors=errors,
            )
            state.trace.validate_node = NodeOutput(
                node="validate",
                reasoning=f"Could not fix in {MAX_FIX_ITERATIONS} iterations. Returning last attempt.",
                confidence=0.0,
                iteration=iteration,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
            return state

        iteration += 1
        fix_node = await _run_fixer(state, _format_errors(report), iteration)
        state.trace.fixer_iterations.append(fix_node)
