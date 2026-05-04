# Context — TerraSketch agentic rebuild

Living handover doc. Keep updated as work progresses.

| Key fact         | Value                                                          |
| ---------------- | -------------------------------------------------------------- |
| Date             | 2026-05-04                                                     |
| Owner            | rajesh@coditation.com                                          |
| v1 endpoint      | `POST /api/generate` — single Claude call. Untouched.          |
| v2 endpoint      | `POST /api/v2/generate` — agent graph. New.                    |
| Spike status     | Code committed; **not yet exercised end-to-end** (no API key run) |
| Detailed backlog | See `todo.md` (P1/P2/P3 across 7 sections, incl. §6 memory)    |

---

## Quick start — try v2 in 5 minutes

> **Read this first if you've just inherited the repo.** If something
> below doesn't work, the spike has a bug — tell us, don't paper over it.

### 1. Configure

```bash
cp backend/.env.example backend/.env
# Edit backend/.env: set ANTHROPIC_API_KEY=sk-ant-...
# Optional: install pre-commit hooks
pip install pre-commit && pre-commit install
```

### 2. Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Smoke-test v2 (text input — no image needed for first run)

```bash
curl -s http://localhost:8000/api/v2/generate \
  -H "Content-Type: application/json" \
  -d '{
    "cloud_provider": "aws",
    "environment": "dev",
    "input_type": "text",
    "text_description": "Simple web app: ALB in front of two EC2 instances in private subnets, RDS MySQL behind them.",
    "session_id": "spike-test-1"
  }' | jq
```

Expected response shape (truncated):

```json
{
  "diagram_ir":     { "nodes": [...], "edges": [...], "ambiguities": [] },
  "resource_plan":  { "cloud_provider": "aws", "resources": [...] },
  "files":          { "main_tf": "...", "variables_tf": "...", "outputs_tf": "...", "providers_tf": "..." },
  "validation":     { "valid": true, "iterations": 0 },
  "trace": {
    "understand":         { "node": "understand", "reasoning": "...", "confidence": 0.9, ... },
    "plan":               { "node": "plan",       "reasoning": "...", "confidence": 0.85, ... },
    "synthesize":         { "node": "synthesize", "reasoning": "...", ... },
    "fixer_iterations":   [],
    "validate":           { "node": "validate",   "reasoning": "...", "confidence": 1.0, ... }
  }
}
```

The `trace.*` blocks are the per-step reasoning that drives the
"Why this code?" panel in the UI (still to be built — see §4 P2 #6).

### Day-1 failure modes

| Symptom                                                           | Cause                                                          | Fix                                                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `502 ANTHROPIC_API_KEY is not configured`                         | Env var missing                                                | Set in `backend/.env`, restart uvicorn.                                                                              |
| `502 Model did not call the required tool '<name>'`               | Tool schema mismatch / model deviated                          | Check `agents/tools.py` schema vs `agents/state.py`; likely a typo. Inspect Anthropic's response in the uvicorn logs. |
| `validation.skipped: true, skip_reason: "terraform CLI not found"`| `terraform` binary not in PATH                                 | Expected without terraform installed. `brew install terraform` to enable the validate↔fixer loop.                    |
| `500` + Pydantic validation error in logs                         | Tool input doesn't match the typed state                       | Schema bug in spike. Compare offending field across `agents/state.py` and `agents/tools.py`.                         |
| 3 `fixer_iterations` and `validation.valid: false`                | Fixer couldn't repair in 3 tries                               | Inspect `validation.final_errors`. Usually planner picked an unsupported argument or model emitted broken HCL.       |
| Long latency (>40s)                                               | Each node = one Claude call; 4–7 calls per run                 | Expected. Mitigations in `todo.md` §3 (caching is on, streaming is not).                                             |

### Pre-commit hooks

`.pre-commit-config.yaml` runs ruff + ruff-format on every commit.
Config is in `backend/pyproject.toml` (`[tool.ruff]`). Run manually:

```bash
cd backend
uvx ruff check app && uvx ruff format app
```

The codebase is currently lint-clean. Keep it that way.

---

## 1. What we discussed

Code review of TerraSketch revealed a working v1 with thoughtful safety
rails (rate-limit, post-process, secret scan, optional `terraform
validate`) but with a single-shot generation pipeline that's hit a ceiling.
The smoking gun was `services/aws_microservice_canonical.py` — 681 lines
of HCL embedded as Python strings, used to *replace* the model's output
when the diagram matches a common pattern. That's what you build when the
model can't reliably do the job and you have a deadline. The fix isn't
more overrides; it's a stronger generation pipeline.

### Conclusions reached

1. **The architecture is the bottleneck, not the model.** Single prompt
   doing perception + planning + synthesis + self-validation is asking
   one inference to do four jobs.
2. **Every step must emit explicit reasoning.** Today reasoning is
   buried in tokens; the user sees a match-score and "improvement_advice"
   strings with no provenance.
3. **Every step needs a feedback channel.** Today the only feedback is
   `correction_note` which regenerates from the image. Users should be
   able to correct the IR, swap a planned resource, edit the plan —
   without re-running upstream nodes.
4. **Validation belongs inside the loop, not after.** v1 runs
   `terraform validate` once and reports the result. v2 feeds errors back
   to a fixer agent (max 3 iterations).

### Out of scope for this rebuild

- Frontend changes (the spike exposes v2 API; UI is a separate ticket).
- DB migration for trace persistence (TODO — see §4).
- v1 deprecation (run both side-by-side until v2 wins on a benchmark).

---

## 2. What we built (the spike + structural cleanup)

Two pieces:
- **A 4-node async agent graph** under `backend/app/agents/` (the spike). v1 path is **functionally** untouched.
- **A structural cleanup** of the existing v1 code so the dev starts from a clean layout. v1 code was moved/renamed but its behaviour is unchanged.

```
[image / text] → understand → plan → synthesize → validate ⇄ fixer (≤3 iters)
                     │           │         │             │
                     ▼           ▼         ▼             ▼
                 DiagramIR  ResourcePlan  Files   ValidationReport
```

### Files added

```
backend/app/agents/
├── __init__.py
├── state.py             ← GraphState, GenerationTrace, NodeOutput, DiagramIR, ResourcePlan, TerraformFiles, ValidationReport
├── prompts.py           ← system prompts, one per node
├── tools.py             ← tool-use schemas (force structured output)
├── llm.py               ← AsyncAnthropic wrapper, prompt caching, image utils
├── nodes/
│   ├── __init__.py
│   ├── understand.py    ← vision-only: diagram → DiagramIR
│   ├── plan.py          ← DiagramIR + provider → ResourcePlan
│   ├── synthesize.py    ← ResourcePlan → 4 HCL files
│   └── validate_fix.py  ← terraform validate + fixer loop
└── graph.py             ← orchestrator (linear with internal loop)

backend/app/api/routes/v2_generate.py   ← POST /api/v2/generate
backend/app/main.py                     ← mounted v2 router
```

### Key technical patterns demonstrated

| Pattern                       | Where                          | Replaces in v1                                                  |
| ----------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Forced tool-use               | `agents/llm.py:call_tool`      | `terraform_parser._extract_json_block` (brace-balancing scanner)|
| Prompt caching (`ephemeral`)  | `agents/llm.py:call_tool`      | Re-sending 1.5k-token system prompt every request               |
| `AsyncAnthropic`              | `agents/llm.py:_client`        | Sync `Anthropic()` blocking the event loop                      |
| Reasoning as tool param       | `agents/tools.py`              | Reasoning lost in token stream                                  |
| Validate-fixer loop           | `nodes/validate_fix.py`        | Validate-as-badge in `routes/generate.py`                       |
| Per-step `NodeOutput` trace   | `state.GenerationTrace`        | No trace at all                                                 |

### Structural cleanup applied to v1 code

| Before                                                | After                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `backend/app/services/*.py` (13 mixed files)          | `services/{llm,terraform,quality,templates}/` subpackages                              |
| `services/llm_service.py` (a router, named like a client) | `services/llm/router.py`                                                           |
| `services/claude_service.py`, `gemini_service.py`, ... | `services/llm/claude.py`, `gemini.py`, `azure_openai.py`, `mock.py`                   |
| `services/terraform_{parser,postprocess,cli}.py` + `file_diff.py` | `services/terraform/{parser,postprocess,cli,file_diff}.py`                |
| `services/diagram_match_analyzer.py`, `secret_scan.py` | `services/quality/{diagram_match,secret_scan}.py`                                     |
| `services/generation_hints.py`                         | `services/templates/generation_hints.py`                                              |
| `services/aws_microservice_canonical.py` (681 LOC of HCL as raw Python strings) | `services/templates/aws_microservice/` — real `.tf` files + small Python loader in `__init__.py` |
| `terraform_2_output/` at repo root                     | `examples/simple_web/`                                                                 |
| Empty nested `TerraSketch/TerraSketch/`                | Deleted                                                                                |
| `IMP_TerraSketch_ProductDocument.md`, `docs/{NGROK,PUBLIC_TUNNEL,RDS_RESTORE}.md` | Deleted — content covered by `README.md` / `context.md` / `todo.md`         |

All imports were updated (`routes/generate.py`, `agents/nodes/validate_fix.py`,
and intra-services). Verified by AST-parsing all 51 backend Python files —
0 errors. README.md updated to reflect the new layout.

### Spike does NOT include

- Persistence of `GenerationTrace` (returned in response only).
- Frontend integration (v2 API is consumable but no UI yet).
- Per-node human-in-the-loop feedback endpoints.
- Cross-run memory (see §3).
- RAG over Terraform provider schema.
- Critique / security agent.
- Explainer agent (`usage_instructions` is empty in v2 today).
- Streaming responses.
- The 5 agents from §5b in `todo.md` beyond the 4 in the spike.

---

## 3. Context lake / context manager — the missing layer

**Today (spike): we have neither.** Each run is amnesiac. Each agent
receives only the upstream artifact. This is fine for the spike but is a
structural gap the dev must address before scale.

There are **two distinct concerns** that often get conflated:

### 3a. Per-run context manager (what's *in the prompt right now*)

Today each agent receives the full upstream artifact via the prompt. While
artifacts are small (DiagramIR with 10 nodes, ResourcePlan with 25 resources)
this is fine. It will start to matter when:

- Plans grow past ~50 resources (token bloat in synthesize).
- We add RAG (provider docs, past examples) — must rank and prune by relevance.
- Critique runs over full HCL with policy docs — easily 30k+ tokens.

**What's needed:**

- A `ContextBuilder` per node that decides what to inject and prunes to a
  token budget.
- A `RetrievedContext` typed object (`{source, content, tokens, relevance}`)
  so each piece is traceable.
- `NodeOutput.cited_contexts: List[str]` so reasoning can be tied back to
  what the model actually saw.
- Token accounting via `anthropic.count_tokens` or model-internal usage.

### 3b. Cross-run context lake (memory across runs / users)

Today every run starts blank. We do not:

- Remember the user's preferences ("user_42 always rejects `acl` on S3").
- Retrieve similar past diagrams as few-shot examples for the planner.
- Build org-specific patterns ("our company uses module X for all VPCs").
- Mine the `feedback` table for low-rated generations to evolve prompts.

**Two flavors of memory, both needed:**

1. **Semantic memory (vector store).** Embed each `(DiagramIR, final files,
   validation_passed)` tuple. On a new run, retrieve k similar past runs
   into the planner's context. Use **pgvector** — Postgres is already
   provisioned, so this is one extension + one column away.
2. **Procedural memory (symbolic preferences).** Per-user/org rules learned
   from feedback. Plain SQL: a `preferences` table keyed on `(user_id, key)`.
   Critique node consults preferences before flagging warnings.

**Anthropic's built-in `memory` tool** (file-system-backed scratchpad,
recently added to the API) is a third option for *intra-session* memory
during long agent runs — useful for the fixer loop, not a substitute for
cross-run memory.

### Recommended interface

A single `MemoryService` protocol so nodes don't know which backend is in
use:

```python
class MemoryService(Protocol):
    async def retrieve_similar(self, ir: DiagramIR, k: int) -> List[PastRun]: ...
    async def get_preferences(self, user_id: Optional[str]) -> Preferences: ...
    async def record_run(self, trace: GenerationTrace, files: TerraformFiles) -> None: ...
```

Implementations: `PgvectorMemory` (semantic) + `SqlPreferences` (procedural)
backing a single facade. Hand-rolled, no new framework needed.

**This is in `todo.md` §7.** Treat as **P1 immediately after the spike**:
without it the agent system can't get smarter and you reinvent the
canonical-template override pattern in vector form.

---

## 4. Dev follow-ups (in priority order)

Map of `todo.md` items to what's blocking what. Numbers refer to `todo.md`
section/item.

### P1 — must do before v2 is shippable to users

1. **Smoke test the spike end-to-end** with a real `ANTHROPIC_API_KEY` and
   a known diagram. The code has not been exercised; expect to find a
   tool-schema typo or two on the first run.
2. **Persist `GenerationTrace`** (`todo.md` §5b TODO #2). Add an
   `agent_trace JSONB` column to `generations` via Alembic. Update the v2
   route to write it on success.
3. **Backfill v1 feature parity in v2 response.** v1 fills
   `resources_identified`, `assumptions`, `usage_instructions`,
   `diagram_match_percent`. Map from the agent trace into a v1-compatible
   shape so existing UI can read v2 with no UI change while you build the
   real "Why this code?" panel.
4. **Benchmark v2 vs v1** on a fixed test set of 10–20 diagrams.
   Metrics: latency, cost (Claude tokens), validate-pass rate,
   resources-identified accuracy. **If v2 doesn't clearly beat v1, do not
   ship — investigate.** This is the gate.
5. **Wire context lake** (`todo.md` §6). pgvector + `MemoryService`
   facade. See §3 above.

### P2 — significant features but parallel-shippable

6. Per-node feedback endpoints (`todo.md` §5b TODO #3): `POST /api/v2/generation/:id/ir/edit` etc. Each edit re-runs from that node forward, not the full graph.
7. Add `critique` node, parallel to validate (`todo.md` §5 table). Security review as an LLM judge.
8. Add `explainer` node to populate `usage_instructions`. Currently empty in v2.
9. RAG over Terraform provider schema in `plan` node (`todo.md` §4).
10. Replace v1 service-module imports the spike inherited (`services/terraform_cli.py` reused; eventually move it under `agents/` or `services/terraform/`).

### P3 — clean-up tickets from the original review

11. Repo-root tidy — done in pre-handoff. See `todo.md` §0.
12. Split `services/` into subpackages (`todo.md` §1).
13. Rename `services/llm_service.py` → `services/llm_router.py` and
    disambiguate "provider" everywhere (`todo.md` §2).
14. Move `aws_microservice_canonical.py` HCL into `templates/aws_microservice/*.tf`
    files — or **retire it entirely** once v2 reliability beats it
    (`todo.md` §1, §4).

### LangGraph migration (P2 — defer until v2 has shipped once)

The spike is a hand-rolled orchestrator. The mapping is one-to-one:

- Each `run_*(state) -> state` becomes a LangGraph node.
- The linear awaits in `graph.run_graph` become `add_edge`.
- The validate↔fixer internal loop becomes `add_conditional_edges`
  (validate → fixer if `not valid and iteration < max`, else END).
- `GenerationTrace` becomes a checkpointed channel via `PostgresSaver`.
- A `correction_note`-style channel becomes a `human-in-the-loop`
  interrupt at `understand` or `plan`.

Migrate when:
- v2 is in production and stable.
- You need conditional/parallel edges (critique parallel to validate,
  HITL interrupts on low confidence).
- You need checkpointing for "resume from node N" — pgvector + Alembic
  trace column gets you 80% of this without LangGraph.

Don't migrate just because LangGraph is fashionable.

---

## 5. Architecture decisions log (don't reverse without reading)

| #  | Decision                                                            | Why                                                                                                                                                                                |
| -- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 | Hand-rolled orchestrator, not LangGraph                             | Spike scope. Migration is mechanical when needed. No LangChain dep until justified by need for conditional/parallel edges.                                                         |
| A2 | Forced tool-use for structured output, no JSON parser fallback      | Tool-use is a hard contract on the API side. The brace-balancing parser in v1 exists because v1 asks the model nicely. Don't carry that hack forward.                              |
| A3 | Reasoning + confidence + decisions are *required* fields in tools   | Required, not optional, so the model can't omit. This is how reasoning becomes a first-class output, not narrative buried in tokens.                                               |
| A4 | Plan and Synthesize are separate nodes                              | Lets us swap synthesize for a deterministic CDKTF emitter later without changing the planner. Plan stays LLM-driven (resource selection); synth becomes a graph→HCL transformation.|
| A5 | v1 endpoint left intact                                             | Run side-by-side until benchmark proves v2 wins. Migration risk = 0.                                                                                                               |
| A6 | `AsyncAnthropic` from the start                                     | Whole point of FastAPI is async. v1's sync handler in a 30s LLM call wastes a whole worker.                                                                                        |
| A7 | Trace is in-memory only in spike                                    | Persistence needs an Alembic migration; that's a dev's first ticket, not the spike's.                                                                                              |
| A8 | No context manager or context lake in spike                         | Acknowledged structural gap — see §3. Address as P1 follow-up. Don't ship v2 publicly without it; you'll regret amnesiac runs.                                                     |

---

## 6. Open questions for product / lead

- Should v2 replace v1 entirely once benchmark wins, or stay as a
  separate "agentic mode" toggle?
- Token budget per generation? Spike is uncapped. Real cost ceiling
  matters once context lake injects past examples.
- Trace visibility: shown to anonymous users, or only logged-in?
  (Sensitive intermediate outputs.)
- Memory scope: per-user, per-session, or global?
  (Affects `MemoryService` shape — see §3.)
