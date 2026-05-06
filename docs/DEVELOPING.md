# Development conventions — TerraSketch

This document encodes how we extend the codebase on the `dev` branch. The
living handover and backlog remain in [`../context.md`](../context.md) and
[`../todo.md`](../todo.md).

## Repository layout

Monorepo: **`backend/`** (FastAPI, v1 + v2 agents), **`frontend/`**,
**`examples/`**, **`scripts/`**. New code belongs in the existing packages
under `backend/app/` (see root [`README.md`](../README.md) tree), not in a
flat `services/*.py` style.

## Two API pipelines (both intentional)

| Path | Role |
|------|------|
| `POST /api/generate` | **v1** — single prompt path through `services/llm/`. Behaviour must stay stable when refactoring; prefer composable stages over growing the route handler. |
| `POST /api/v2/generate` | **v2** — four-node agent graph: understand → plan → synthesize → validate ⇄ fixer (`backend/app/agents/`). This is the long-term direction. |

Do not remove or silently change v1 while v2 is proven against benchmarks.

## Patterns for new work (especially v2 and agents)

1. **Structured output** — Prefer **forced tool-use** and typed state
   (`agents/tools.py`, `agents/state.py`), not ad-hoc “parse JSON from prose”
   for agent steps.
2. **Traceability** — Per-step **reasoning and confidence** stay in the v2
   trace model; keep fields required where the schema already mandates them.
3. **Validation** — **Inside a repair loop** (validate ⇄ fixer) for v2, not
   only a post-hoc badge.
4. **Async** — v2 LLM calls use **`AsyncAnthropic`**; keep new I/O on async
   paths consistent with FastAPI.
5. **Lint** — Run **ruff** before push (`uvx ruff check app && uvx ruff format
   app` from `backend/`), or use **pre-commit** (`pip install pre-commit &&
   pre-commit install` from repo root).

## When the spike or handover steps fail

If `context.md` quick-start or v2 curl smoke tests fail after correct env
setup, treat that as a **real bug** (schema, tool contract, or docs). Fix at
the source or report upstream; do not paper over with shortcuts that fight the
agent design.

## Naming: `cloud_provider` vs LLM provider

Use **`cloud_provider`** for AWS / Azure / GCP. Reserve **`llm_provider`**
(or settings names like `LLM_PROVIDER`) for Anthropic / Gemini / Azure OpenAI.
Avoid bare `provider` where both meanings could apply.

## Priority work

Follow **`todo.md`** P1 → P2; **`context.md` §4** maps items to release order
(smoke test, trace persistence, v1-shaped v2 fields, benchmark, memory).
