# TerraSketch — TODO

Open items only. Pre-handoff cleanup (services restructure, HCL extraction,
repo-root tidy, lint setup, v2 spike) is summarized in `context.md`.

**Format:** every finding has a **severity tag** + a **code anchor** (file path + line) so a dev (or an AI handed this doc) can jump straight to the change site. Severity tags: 🔴 **critical** (blocks shipping or correctness) · 🟠 **high** (significant gap, do soon) · 🟡 **medium** (worth doing) · 🟢 **low** (polish).

Priority tags on TODO items: **P1** = high-impact / quick win. **P2** = meaningful but more work. **P3** = nice-to-have.

---

## 0. End-to-end status — what works, what's lacking

> Dual lens: **PM** (does the user get what we promised?) + **architect**
> (is the structure load-bearing for the next 6 months?). Snapshot taken
> 2026-05-12 against commit `514aa76`. Update when the shape of the
> product or pipeline changes.

---

### 0.1 What's working end-to-end

> v1 happy path (image/text → 4 `.tf` files in browser → ZIP) is shippable today. v2 spike is committed and lint-clean but **unexercised**.

- ✅ **API contract.** Single typed contract for image/text/draw × aws/azure/gcp × dev/staging/prod.
  - Code: `backend/app/db/schemas.py:16-58` (`GenerateRequest`), `:69-83` (`GenerateResponse`).
- ✅ **Multi-LLM routing.** Routes to claude/gemini/azure/mock with quota-fallback to mock.
  - Code: `backend/app/services/llm/router.py:25-89`.
- ✅ **Image ingestion.** Accepts data-URL or raw base64; Pillow autodetects PNG/JPEG/WEBP/GIF.
  - Code: `backend/app/services/llm/claude.py:36-79` (`_strip_data_url`).
- ✅ **v1 single-shot generation orchestration.** Validate → LLM → parse → postprocess → canonical override → match → secret-scan → tf-validate → persist.
  - Code: `backend/app/api/routes/generate.py:61-212` (`post_generate`).
- ✅ **HCL parser tolerance.** Recovers JSON from markdown fences and prose preludes.
  - Code: `backend/app/services/terraform/parser.py:25-67` (`_extract_json_block`).
- ✅ **Postprocess fixes.** Strips duplicate `provider "aws"` blocks in `main.tf`.
  - Code: `backend/app/services/terraform/postprocess.py:33-77`.
- ✅ **Diagram-match scoring (provider-aware, reworked in `514aa76`).** AWS-VPC vs AWS-serverless vs Azure vs GCP rules + completeness blending.
  - Code: `backend/app/services/quality/diagram_match.py:62-509`.
- ✅ **Secret scanning.** Regex-flags Anthropic/Google/AWS-style keys + hardcoded passwords.
  - Code: `backend/app/services/quality/secret_scan.py:7-37`.
- ✅ **Optional `terraform validate`.** Runs in tempdir; gracefully skips when CLI missing or `SKIP_TERRAFORM_VALIDATE=true`.
  - Code: `backend/app/services/terraform/cli.py:13-91`.
- ✅ **Canonical AWS microservice override.** Pattern-detects 7-component stack (CloudFront+S3+ALB+ECS+ElastiCache+Aurora+Dynamo) and swaps in real `.tf` files. *Works, but acknowledged smell — see §4.*
  - Code: `backend/app/services/templates/aws_microservice/__init__.py:33-99`.
- ✅ **File diff between runs.** Per-file added/removed/changed summary.
  - Code: `backend/app/services/terraform/file_diff.py`.
- ✅ **Persistence (Generation / User / Feedback).** Postgres in prod, SQLite for local; 3 Alembic migrations.
  - Code: `backend/app/db/models.py:31-87`; `backend/alembic/versions/000{1,2,3}_*.py`.
- ✅ **Auth + history + feedback endpoints.** JWT, anonymous-via-session-id, session-to-account attach.
  - Code: `backend/app/api/routes/{auth,history,feedback}.py`.
- ✅ **Production hardening.** Rate limit, request-ID, CORS + private-LAN regex, SQLAdmin.
  - Code: `backend/app/core/limiter.py`; `backend/app/middleware/request_id.py`; `backend/app/main.py:78-97,150-167`; `backend/app/admin_ui.py`.
- ✅ **Frontend E2E UX.** Upload/describe → Monaco code viewer → match-score ring → diff summary → ZIP download.
  - Code: `frontend/src/pages/{Generate,Result,History,SignIn}.jsx`; `frontend/src/components/CodeViewer/*`; `frontend/src/components/insights/InsightsDeck.jsx`.
- ✅ **Dev experience.** Ruff + ruff-format pre-commit; one-command local stack.
  - Code: `.pre-commit-config.yaml`; `backend/pyproject.toml`; `docs/DEVELOPING.md`; `dev.sh`.
- ⚠️ **v2 agentic spike (CODE ONLY, untested).** 4-node async graph + forced tool-use + prompt caching + per-node `NodeOutput` trace + validate-fix loop ≤3 iters. Mounted at `POST /api/v2/generate`.
  - Code: `backend/app/agents/{graph,llm,prompts,tools,state}.py`; `backend/app/agents/nodes/*.py`; `backend/app/api/routes/v2_generate.py`.

---

### 0.2 What's lacking — by lens

> Each item: severity · one-line gap · code anchor (where it lives or where the fix goes) · pointer to the deeper section in this doc.

#### A. Product gaps (PM lens — what the user still can't do)

- 🔴 **P1 — v2 has never been smoke-tested with a real key.** The agentic rebuild is a hypothesis until run once; expect tool-schema / Pydantic typos on first run.
  - Run: `POST /api/v2/generate` with curl example in `context.md:42-51`.
  - Owner: §5 (first P1 bullet).
- 🔴 **P1 — No v2-vs-v1 benchmark.** Without numbers we can't justify retiring v1, tune nodes, or tell users it's better.
  - Code to write: a `scripts/benchmark_v1_v2.py` against `examples/simple_web/` + 9 more diagrams.
  - Owner: §5.
- 🟠 **P1 — No frontend for v2.** `api.js` lacks a `generateTerraformV2()`; users still hit v1.
  - Code: add to `frontend/src/services/api.js:76-79` (mirror `generateTerraform`).
  - Owner: §7.
- 🔴 **P1 — No "Why this code?" panel.** The reasoning trace is the differentiator vs Brainboard but never reaches the UI because trace isn't persisted.
  - Code: add `agent_trace JSONB` column → `backend/app/db/models.py:46-71` + new Alembic migration `0004_agent_trace.py`; write trace in `backend/app/api/routes/v2_generate.py:36-45`.
  - Owner: §5b (first P1).
- 🔴 **P1 — No per-node feedback.** Users can only re-run from scratch via `correction_note`.
  - Code: add `POST /api/v2/generation/:id/{ir,plan,files}/edit` to `backend/app/api/routes/v2_generate.py`.
  - Owner: §5b.
- 🟠 **P2 — v2 returns no `usage_instructions`.** v1 fills it; v2 leaves it blank.
  - Code: add an Explainer node `backend/app/agents/nodes/explain.py` + register in `backend/app/agents/graph.py:42-45`.
  - Owner: §5 (Explainer).
- 🟠 **P2 — No security / critique pass.** Only regex secret-scan; "S3 missing public access block" / "CloudFront on HTTP" / IAM-too-broad are invisible.
  - Code: add Critique node `backend/app/agents/nodes/critique.py`; run in parallel with `run_validate_fix` in `backend/app/agents/graph.py`.
  - Owner: §5 (Critique).
- 🟡 **P3 — Feedback loop is one-way.** 1–5 stars collected, nothing read.
  - Code: `backend/app/db/models.py:74-86` (`Feedback` table is collected but no reader exists anywhere in the codebase — grep confirms).
  - Owner: §4, §6.
- 🟢 **P3 — Brand/script naming inconsistency.** `run_terraketch.sh` (misspelled), `dev.sh`, `TerraSketch` co-exist in repo root.
  - Code: `run_terraketch.sh` (delete or rename) vs `dev.sh`.
  - Owner: §7.

#### B. Architecture gaps (architect lens)

- 🔴 **P1 — No cross-run memory.** Every agent run starts amnesiac; v2 will reinvent canonical-override in agent form.
  - Code to write: `backend/app/services/memory/{__init__,pgvector,sql_preferences}.py`; consume from `backend/app/agents/nodes/plan.py:34-39`.
  - Owner: §6b.
- 🟠 **P1 — No per-run context manager.** Each node receives full upstream artifact; breaks at >50 resources or once RAG injects material.
  - Code to write: `backend/app/agents/context.py` (`ContextBuilder`, `RetrievedContext`); use in every `run_*` node before `call_tool`.
  - Owner: §6a.
- 🟠 **P2 — No RAG over Terraform provider schema.** Hand-curated resource list in `backend/app/core/prompt_builder.py:30-58` rules 11-23 ages, misses services, hallucinates deprecated args.
  - Code to write: `backend/app/services/rag/terraform_schema.py`; consume from `backend/app/agents/nodes/plan.py`.
  - Owner: §4.
- 🟠 **P2 — No deterministic HCL emitter.** Synthesis is LLM-driven end-to-end → brittle. CDKTF or Python HCL writer would eliminate a class of bugs.
  - Code: replace `backend/app/agents/nodes/synthesize.py:23-55` body; keep contract.
  - Owner: §4.
- 🔴 **P1 — Single-shot prompt does perception + planning + synth + self-check in v1.** Root cause of needing canonical override.
  - Code: `backend/app/services/llm/claude.py:117-178` (the whole `generate_terraform` is the offender) + `backend/app/core/prompt_builder.py:10-77` (system prompt asks for all four jobs).
  - Owner: §4.
- 🟠 **P2 — Sync route on a 30s LLM call (v1).** `def post_generate` blocks an entire worker; v2 is async, v1 isn't.
  - Code: `backend/app/api/routes/generate.py:61` (`def` not `async def`); `backend/app/services/llm/claude.py:138` (sync `Anthropic` client).
  - Owner: §1.
- 🟠 **P1 — God-route in v1.** 200+ LOC handler hard-wires postprocess/canonical/match/secret-scan/diff/validate.
  - Code: split `backend/app/api/routes/generate.py:61-212` into a `GenerationPipeline` with composable stages.
  - Owner: §1 (first P1).
- 🟠 **P1 — Provider mismatch silently swallowed in v1.** Logs and continues when LLM returns wrong cloud.
  - Code: `backend/app/api/routes/generate.py:120-125` — change `logger.info(...)` to `raise HTTPException(status_code=502, ...)`.
  - Owner: §1.
- 🟠 **P1 — No prompt caching in v1.** ~1.5k system prompt resent every request → ~90% cost waste on repeat calls.
  - Code: `backend/app/services/llm/claude.py:158-163` — wrap `system=SYSTEM_PROMPT` as `[{"type":"text","text":SYSTEM_PROMPT,"cache_control":{"type":"ephemeral"}}]` (pattern is already in `backend/app/agents/llm.py:94-100`).
  - Owner: §3.
- 🟠 **P1 — Brace-matching JSON parser still used in v1.** Exists only because v1 asks the model nicely.
  - Code: `backend/app/services/terraform/parser.py:25-67` — replace with forced tool-use (pattern in `backend/app/agents/tools.py:113-136` + `backend/app/agents/llm.py:84-124`).
  - Owner: §3.
- 🟡 **P2 — Provider naming collision.** "provider" means cloud (aws/azure/gcp) AND LLM (anthropic/gemini/azure).
  - Code: `backend/app/api/routes/generate.py:103` passes `provider=payload.cloud_provider` but the receiving param is also `provider` — confusing. Rename everywhere: `cloud_provider` for cloud side, `llm_provider` for LLM side.
  - Owner: §2.

#### C. Reliability + correctness gaps

- 🟠 **P3 — Stale model default.** `ANTHROPIC_MODEL = "claude-sonnet-4-20250514"` (year-old).
  - Code: `backend/app/core/config.py:24`; also `render.yaml`.
  - Fix: bump to `claude-sonnet-4-6` or `claude-opus-4-7`.
  - Owner: §3.
- 🟠 **P2 — AWS-only rules shipped to Az/GCP.** Rules 11-16 in system prompt are AWS-specific but always sent.
  - Code: `backend/app/core/prompt_builder.py:30-36` (the `AWS DIAGRAM ACCURACY` block) — build system prompt dynamically per `provider`.
  - Owner: §3.
- 🟡 **P2 — `MAX_FIX_ITERATIONS=3` hard-coded.** No env override.
  - Code: `backend/app/agents/nodes/validate_fix.py:26`.
  - Fix: read from `get_settings()`.
- 🟡 **P2 — Diagram-match heuristics are a 545-LOC regex stack.** Maintenance load grows per provider variant.
  - Code: `backend/app/services/quality/diagram_match.py` (whole file).
  - Fix: once v2 ships, replace with `terraform validate` pass-rate + a learned scorer.
  - Owner: §4.
- 🟠 **P2 — Subprocess env leak.** Passes full `os.environ` to `terraform`; exposes `ANTHROPIC_API_KEY` and `AWS_*` to provider plugins.
  - Code: `backend/app/services/terraform/cli.py:33` — replace with `env={"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", ""), "TF_INPUT": "0"}`.
  - Owner: §7.
- 🟠 **P1 — `terraform init` is network-bound, synchronous, foreground.** Risks request timeout on Render free tier.
  - Code: `backend/app/services/terraform/cli.py:34-41` (the `init` call inside `run_terraform_validate`).
  - Fix: default `SKIP_TERRAFORM_VALIDATE=true` in prod (`render.yaml`), or move validate to a background worker.
  - Owner: §7.
- 🟡 **P3 — Module-level `_settings` snapshot.** Env edits don't reload until restart.
  - Code: `backend/app/api/routes/generate.py:32` — use `_settings = Depends(get_settings)` inside the route.
  - Owner: §7.

#### D. Ops + observability gaps

- 🔴 **P1 — No `agent_trace` column / Alembic migration.** Trace exists only in memory; lost on every response.
  - Code: add `agent_trace: Mapped[dict | None]` JSON column at `backend/app/db/models.py:46-71`; write new migration `backend/alembic/versions/0004_agent_trace.py`; write in `backend/app/api/routes/v2_generate.py:45`.
- 🟠 **P2 — No metrics / cost telemetry.** No per-node duration aggregation, no token cost, no failure rates.
  - Code: extend `backend/app/agents/state.py:27-36` (`NodeOutput`) with `input_tokens / output_tokens`; emit Prometheus or write to a `node_metrics` table.
- 🟡 **P2 — No raw-response persistence.** Can't re-run parsing against history when we change schemas.
  - Code: add `raw_response: dict | None` column to `generations` (and write from `backend/app/api/routes/generate.py:184-200`).
- 🟢 **P3 — No deployment verification.** `render.yaml` ships defaults; no smoke-check that `SKIP_TERRAFORM_VALIDATE` is correct for prod.

---

### 0.3 Audit: agent contracts + HITL placement

> **Verdict up front:** decomposition is sound (4 nodes, perception → planning → synthesis → validation). Per-node contracts have **real correctness holes** (not style issues). v2 today has **zero HITL gates** despite §5b documenting where they should go.

---

#### A. Understand node (`backend/app/agents/nodes/understand.py`)

- 🔴 **U1 — `cloud_provider` leaks into Understand.** Bias risk: a generic "cache" icon gets labelled `elasticache_redis` because the prompt names AWS. Conflates perception with mapping.
  - Code: `backend/app/agents/nodes/understand.py:28-33` (the "Provider context (for tier hints)" text block).
  - Fix: remove provider from the user message in Understand; let Plan disagree about target service later.
- 🟠 **U2 — `tier: public/private/data/edge` lives on `IRNode`.** Tier is a *network-topology decision*, not a *visual fact*. Diagrams don't always paint zones.
  - Code: `backend/app/agents/state.py:39-45` (`IRNode.tier`) + `backend/app/agents/tools.py:42-46` (tool schema enforces it).
  - Fix: move `tier` to `PlannedResource` or to a downstream Mapper output; remove from Understand's contract.
- 🔴 **U3 — No per-node / per-edge confidence.** Only one global `confidence` on the whole IR.
  - Code: `backend/app/agents/state.py:39-54` (`IRNode`, `IREdge`); `backend/app/agents/tools.py:32-66`.
  - Fix: add `confidence: float = 1.0` to both `IRNode` and `IREdge`. Needed for Clarifier to interrupt on a *specific* low-confidence node.
- 🔴 **U4 — No position / bounding-box for nodes.** When IR surfaces in HITL UI, user can't map `n3` back to an on-screen icon.
  - Code: `backend/app/agents/state.py:39-45` (`IRNode`); `backend/app/agents/tools.py:36-46`.
  - Fix: add `bbox: tuple[float,float,float,float] | None` (normalized 0-1). Blocks the "edit the IR" HITL story until done.
- 🟡 **U5 — `multiplicity: int` can't express "x2 in AZ-A, x2 in AZ-B".** Multi-AZ HA is the commonest diagram; collapsed to one integer.
  - Code: `backend/app/agents/state.py:39-44`.
  - Fix: replace with `multiplicity: list[dict]` (e.g. `[{"zone":"a","count":2},{"zone":"b","count":2}]`) or move multi-zone to `decisions`.
- 🟡 **U6 — `ambiguities` is a global string list, not per-node.** Same root as U3.
  - Code: `backend/app/agents/state.py:56-59`.
  - Fix: replace with `ambiguities: list[{node_id: str, note: str}]`.
- 🟢 **U7 — `decisions=[]` is hard-coded in Understand,** even though the `NodeOutput` schema allows decisions.
  - Code: `backend/app/agents/nodes/understand.py:63`.
  - Fix: forward `result.get("decisions", [])` like Plan / Synth do.

---

#### B. Plan node (`backend/app/agents/nodes/plan.py`)

- 🔴 **P1 — `PlannedResource.args: dict[str, Any]` is unconstrained.** Synth has to guess what's in there. Plan and Synth can disagree silently.
  - Code: `backend/app/agents/state.py:62-68`; `backend/app/agents/tools.py:84-95`.
  - Fix: structure `args` as a typed dict per `terraform_type`, or make Synth assert that every key in `args` shows up in `main.tf`.
- 🔴 **P2 — No per-resource reasoning.** Top-level `reasoning` is one string for the whole plan.
  - Code: `backend/app/agents/state.py:62-68`.
  - Fix: add `reasoning: str` and `alternatives: list[str]` to `PlannedResource`; surface as tool-tip in UI.
- 🔴 **P3 — Plan doesn't see `correction_note` or `architecture_preset` from v1.** They're not even threaded through `run_graph(...)`. v1's only HITL channel is silently dead in v2.
  - Code: `backend/app/agents/graph.py:23-29` (signature); `backend/app/api/routes/v2_generate.py:37-42` (call site); `backend/app/db/schemas.py:20-28` (where they live in the request).
  - Fix: add `correction_note: str | None`, `architecture_preset: str` params to `run_graph` and weave into Plan's `user_text` at `backend/app/agents/nodes/plan.py:29-33`.
- 🟠 **P4 — `cloud_provider` in Plan's output isn't validated against the request.** Model could return `azure` resources for an `aws` request and we'd store it.
  - Code: `backend/app/agents/nodes/plan.py:41-45`.
  - Fix: assert `result["cloud_provider"] == state.cloud_provider` and raise `AgentLLMError` otherwise.
- 🔴 **P5 — `skipped_ir_node_ids` has no reason field.** "Why was the database dropped?" — buried in `decisions` (free text), if the model bothered.
  - Code: `backend/app/agents/state.py:71-74`; `backend/app/agents/tools.py:100-104`.
  - Fix: change to `skipped: list[{ir_node_id: str, reason: str}]`.
- 🔴 **P6 — `depends_on_local_ids` only models "depends on" — not "ingress from", "trust", "target group of", "policy attached to".** Real Terraform topology is a typed multigraph; Plan flattens it.
  - Code: `backend/app/agents/state.py:65` (`depends_on_local_ids: list[str]`).
  - Fix: replace with `edges: list[{source: str, target: str, kind: Literal["depends_on","ingress","trust","target_of","attaches_to"], port?: int}]`.
- 🟡 **P7 — `ir_node_ids` mapping silently allows fan-in (merge) and fan-out (split).** Merging 5 IR nodes into 1 resource is usually a perception loss; no guard, no flag.
  - Code: `backend/app/agents/state.py:67`.
  - Fix: in Plan post-processing, log a warning when any IR node lacks a planned resource AND is not in `skipped_ir_node_ids` — that's a silent drop.

---

#### C. Synthesize node (`backend/app/agents/nodes/synthesize.py`)

- 🔴 **S1 — `ResourcePlan` is discarded after Synth writes HCL.** No mapping from a line in `main.tf` back to a `PlannedResource.local_id`. **Breaks "Why this code?" entirely.**
  - Code: `backend/app/agents/nodes/synthesize.py:40-47`.
  - Fix: emit `local_id` as a Terraform comment above each resource (`# plan_local_id: web_alb`); also store the `ResourcePlan → TerraformFiles` mapping in `GenerationTrace.synthesize.decisions` or a new `synthesize.line_map` field.
- 🔴 **S2 — Plan's `args` dict is fed as JSON inside the user message with no enforcement.** Synth can ignore, contradict, or invent.
  - Code: `backend/app/agents/nodes/synthesize.py:28-32` (user message) + `backend/app/agents/prompts.py:45-57` (system prompt).
  - Fix: after Synth returns, run a static check that every `args` key in the plan appears in `main.tf` for that resource.
- 🟠 **S3 — Synth doesn't see `DiagramIR.ambiguities`.** Cannot emit `# assumed Redis 7.x because diagram said "cache"`.
  - Code: `backend/app/agents/nodes/synthesize.py:28-32`.
  - Fix: pass `state.diagram_ir.ambiguities` and prompt Synth to inline them as comments.
- 🟡 **S4 — `confidence` field on Synth is meaningless.** Synth is meant to be mechanical given the plan.
  - Code: `backend/app/agents/state.py:113`; `backend/app/agents/tools.py:124`.
  - Fix: either (a) drop `confidence` from Synth's tool, or (b) acknowledge Synth is *not* mechanical and document why — this is the architecture gap behind §4 (deterministic emitter).
- 🟠 **S5 — No truncation guard / continuation.** A 30k-token `main.tf` returns silently truncated by `ANTHROPIC_MAX_TOKENS`.
  - Code: `backend/app/agents/llm.py:107` (`max_tokens`); `backend/app/core/config.py:26` (`ANTHROPIC_MAX_TOKENS=16384`).
  - Fix: check Anthropic response `stop_reason == "max_tokens"` and raise; eventually, chunked Synth per-resource.
- 🟡 **S6 — Single `reasoning` string for all four files.** No per-file or per-resource trace.
  - Code: `backend/app/agents/state.py:113`.
  - Fix: see S1 — `line_map` is the structural fix.

---

#### D. Validate-Fix node (`backend/app/agents/nodes/validate_fix.py`)

- 🔴 **V1 — Fixer is a blind editor.** It does NOT see the `ResourcePlan` — only the current files + errors + prior reasoning. Can silently delete required resources.
  - Code: `backend/app/agents/nodes/validate_fix.py:42-66` (`_run_fixer`).
  - Fix: include `state.resource_plan.model_dump_json()` in the fixer's `user_text` and add a rule to `backend/app/agents/prompts.py:60-71` (`FIXER_SYSTEM`): "Do not delete or add resources not in the plan."
- 🔴 **V2 — No structural diff after the fixer.** Cannot detect that the fixer drifted the architecture — only the user can.
  - Code: `backend/app/agents/nodes/validate_fix.py:144-145` (after `_run_fixer` returns).
  - Fix: after each fix iteration, run a regex-or-AST check that resource counts per `terraform_type` are unchanged vs the plan; record drift in `NodeOutput.decisions`.
- 🟠 **V3 — No learning across fixer iterations.** Each iter is a fresh LLM call; iter 2 doesn't know what iter 1 tried.
  - Code: `backend/app/agents/nodes/validate_fix.py:50-61` (user text).
  - Fix: pass prior iteration diffs as context — `state.trace.fixer_iterations` is already populated; include its decisions / reasoning in the next call.
- 🟡 **V4 — `valid: bool` can't represent "skipped / unknown".** Today `skipped=True` sets `valid=False, confidence=0.0` — indistinguishable from a real failure.
  - Code: `backend/app/agents/state.py:94-99` (`ValidationReport`).
  - Fix: change to `valid: bool | None` (None == skipped); update consumers.
- 🟡 **V5 — `final_errors` is an unparsed string blob.** Cannot count/categorise across runs.
  - Code: `backend/app/agents/state.py:97`; `backend/app/agents/nodes/validate_fix.py:33-39` (`_format_errors`).
  - Fix: parse terraform validate output into `list[{file, line, code, message}]`.
- 🟢 **V6 — `MAX_FIX_ITERATIONS=3` is a module-level constant.** No env override.
  - Code: `backend/app/agents/nodes/validate_fix.py:26`.
  - Fix: move to `Settings` (`backend/app/core/config.py`) as `AGENT_MAX_FIX_ITERATIONS: int = 3`.
- 🟢 **V7 — Fixer prompt says "Preserve all existing variable names that already validated"** — but we never tell the model which validated.
  - Code: `backend/app/agents/prompts.py:66` (the line in `FIXER_SYSTEM`).
  - Fix: either drop that line, or after a successful validate of *some* files, persist the validated subset and feed it to the next fixer call.

---

#### E. Cross-node contract issues (info that should flow but doesn't)

- 🔴 **X1 — `correction_note` and `architecture_preset` never reach the graph.** v1's only HITL channel is silently dropped in v2.
  - Code: `backend/app/api/routes/v2_generate.py:37-42` (call to `run_graph` strips them); `backend/app/agents/graph.py:23-29` (signature doesn't accept them).
  - Fix: see P3 above.
- 🟠 **X2 — `ambiguities` (Understand) never reaches Synthesize.** Generated HCL can't say "I assumed Redis because the diagram said cache".
  - Code: dropped at `backend/app/agents/nodes/plan.py` (doesn't forward) and `backend/app/agents/nodes/synthesize.py:28-32` (doesn't read).
  - Fix: see S3 above.
- 🟠 **X3 — `session_id` / `user_id` / `request_id` not in `GraphState`.** Can't correlate a v2 run with a `generations` row, an auth user, or an X-Request-ID header.
  - Code: `backend/app/agents/state.py:118-129` (`GraphState`).
  - Fix: add `session_id`, `user_id`, `request_id` fields; pass through from `backend/app/api/routes/v2_generate.py:30-45`.
- 🔴 **X4 — `GenerationTrace` is in-memory only.** If the request times out at fixer iteration 2, all reasoning is lost. **No DB write at all in v2 today.**
  - Code: `backend/app/api/routes/v2_generate.py:30-55` (no `db.add(...)` anywhere).
  - Fix: ties to the agent_trace column work in §0.2 D.
- 🟠 **X5 — No replay seed / determinism.** Re-running the same diagram produces a different IR. HITL "undo and try again" is impossible upstream.
  - Code: `backend/app/agents/llm.py:104-112` (the `messages.create` call) — no seed plumbing.
  - Fix: Anthropic SDK doesn't expose a seed, so cache `(image_hash + node_name + prompt_hash) → tool_input` instead; lookup before calling.
- 🟠 **X6 — No partial-result return.** If Synth fails, Understand+Plan work is wasted.
  - Code: `backend/app/agents/graph.py:42-45` (linear awaits); `backend/app/api/routes/v2_generate.py:43-45` (any error → 502).
  - Fix: wrap each `run_*` in try/except in `graph.py`; return `AgentRunResult(diagram_ir=..., resource_plan=..., files=None, error="synth failed")`.
- 🟡 **X7 — `anthropic==0.39.0`** (Oct 2024) predates extended thinking and the built-in `memory` tool. A pin bump is a precondition for §3 P2 and §6b P3.
  - Code: `backend/requirements.txt:9`.
  - Fix: bump to `anthropic>=0.50,<1.0`; verify async API surface unchanged.

---

#### F. HITL audit

##### F.1 What exists today

- 🔴 **v2 has ZERO HITL gates.** `POST /api/v2/generate` is fire-and-forget; the graph runs end-to-end and returns once.
  - Code: `backend/app/api/routes/v2_generate.py:30-55`.
- v1 has two pseudo-HITL knobs (both pre-generation only, no mid-pipeline pause):
  - `architecture_preset` (`auto / simple_web / microservice / serverless`) at `backend/app/db/schemas.py:20-23`; consumed in `backend/app/services/templates/generation_hints.py`.
  - `correction_note` (free-text) at `backend/app/db/schemas.py:24-28`; consumed in `backend/app/api/routes/generate.py:95-99`.
- 🔴 **Neither v1 knob is actually wired to v2** (see X1).
- 🟡 **Feedback table is one-way.** 1–5 stars collected, no reader.
  - Code: `backend/app/db/models.py:74-86`; `backend/app/api/routes/feedback.py`.

##### F.2 What's documented (`§5b` table) — assessment

The placement table in §5b picks the right gates; the prerequisites are unbuilt:

- ✅ **Edit IR after Understand, before Plan** — right gate (highest leverage). **Blocked by U4** (no bbox → editor can't render).
- ✅ **Confidence-gated Clarifier interrupt** — right idea. **Blocked by U3** (only global confidence today). Also: Clarifier node doesn't exist.
- ✅ **Swap mapped resource (Resource Mapper)** — right gate. **Blocked by P1+P2** (no per-resource reasoning or typed args to swap on).
- ✅ **Edit/reject Plan before HCL** — right gate. **Blocked by P6** (dep model is too thin; user can't see/edit "ALB-SG → ECS-SG ingress on 8080").
- ⚠️ **No HITL on Synth** — premature. Synth is not deterministic today (S4). Until S1/S2 land, Synth needs a "preview-before-persist" gate.
- ⚠️ **Validator/Fixer auto loop with escalation** — policy is right, escalation has no target. Today "escalate" = return `valid=False`.
- ✅ **Critique dismiss-as-preference** — sound. Critique node doesn't exist yet.
- ✅ **Explainer: no HITL** — correct (it just narrates).

##### F.3 Missing pieces in the HITL design itself

- 🔴 **H1 — Confidence-gating is unimplemented.** Schema has `NodeOutput.confidence` everywhere; nothing reads it.
  - Code: `backend/app/agents/state.py:32` (`confidence: float`) is never inspected anywhere in `backend/app/agents/`.
  - Fix: in `backend/app/agents/graph.py:42-45`, branch on confidence after each node — if `< 0.7`, return an interrupt response instead of continuing.
- 🔴 **H2 — No "re-run from node N" capability.** Without this, every HITL edit forces a full re-run from Understand. *§5 lists this as P3 — it should be P1, it gates everything else.*
  - Code: `backend/app/agents/graph.py:30-45` (linear `run_*` chain) — refactor to a `Step` registry keyed by name; accept `start_from: NodeName, seeded_state: GraphState` params.
- 🔴 **H3 — No persisted intermediate state.** HITL needs pause → user response → resume — requires durable IR/Plan/Files between requests.
  - Code: depends on §0.2 D first bullet (`agent_trace` column).
- 🟠 **H4 — No HITL identity model.** Who is allowed to edit which generation's IR/plan?
  - Code: `state.GraphState` has no `user_id` (see X3).
  - Fix: enforce `generation.user_id == current_user.id OR generation.session_id == request.session_id` in every `/edit` endpoint.
- 🔴 **H5 — No interrupt protocol on the API surface.** v2 is single request → single response.
  - Code to write: `POST /api/v2/generation/:id/ir/edit`, `POST /api/v2/generation/:id/plan/edit`, `POST /api/v2/generation/:id/resume` in `backend/app/api/routes/v2_generate.py`.
- 🟡 **H6 — No "preview without persist" mode.** Every HITL flow needs intermediate states the user might reject.
  - Code: `backend/app/db/schemas.py:GenerateRequest` — add `dry_run: bool = False`.
- 🟢 **H7 — No batch HITL.** "Show 10 ambiguities at once, resolve all" is faster than 10 one-by-one.
  - Code: affects API shape — design for it now even if not built.

##### F.4 Bottom line on HITL

- Decomposition is sound; HITL placement is well-designed but **unbuilt**.
- v2 has zero gates today.
- **Smallest move that makes HITL exist at all:** fix **X1** (thread `correction_note` + `preset` into the graph) + **S1** (carry `local_id` into HCL comments) + **H2** (re-run from node N). That trio is smaller than adding a Critique or Explainer node, and the rest of the rebuild hangs on it.

---

### 0.4 The 90-day arc (PM-architect alignment)

Treat §0.2 as the gap inventory; this is the order of operations.

1. **Smoke v2** (§0.2 A, #1). Hours of work; unblocks everything.
2. **Persist trace + benchmark v1 vs v2** (§0.2 A, #2 + #4 + D #1). Decides whether v2 is the product or a research branch. ~2 days.
3. **Wire v2 into the UI behind a flag** (§0.2 A, #3 + #4). First time the user sees the differentiator. ~1 week.
4. **Cross-run memory + RAG** (§0.2 B, #10 + #12). Removes the structural reason canonical-override exists. ~2 weeks.
5. **Critique + Explainer + per-node feedback** (§0.2 A, #5 + #6 + #7). Closes the agentic story end-to-end. ~2 weeks.
6. **Retire v1 + canonical override** (§0.2 B, #14 + brace parser). Once 3-5 land, v1's reason to exist evaporates.

Everything else in B/C/D under §0.2 is parallelisable. Don't do them first.

---

## 1. Architecture

- 🟠 **P1 — Break up `routes/generate.py` (200-line god-route).**
  - Code: `backend/app/api/routes/generate.py:61-212`.
  - Fix: extract a `GenerationPipeline` class with composable stages: `Postprocess`, `CanonicalOverride`, `MatchScore`, `SecretScan`, `Diff`, `Validate`. Today, adding/removing a check means editing the handler.

- 🟠 **P1 — Don't silently swallow provider mismatch.**
  - Code: `backend/app/api/routes/generate.py:120-125`.
  - Fix: change the `logger.info(...)` to `raise HTTPException(status_code=502, detail=f"LLM returned provider={ai_output.provider}, expected {payload.cloud_provider}")`.

- 🟠 **P2 — Move to async path.**
  - Code: `backend/app/api/routes/generate.py:61` (`def` not `async def`); `backend/app/services/llm/claude.py:138` (`Anthropic(...)`); `backend/app/db/session.py` (sync `Session`).
  - Fix: `AsyncAnthropic` + async DB session + `async def` routes — matches FastAPI idiom; pattern is already in v2 (`backend/app/agents/llm.py:73-81`).

---

## 2. Naming

- 🟡 **P2 — Disambiguate "provider".**
  - Code: `backend/app/api/routes/generate.py:103` calls `generate_terraform(provider=payload.cloud_provider, ...)`; the receiver param in `backend/app/services/llm/router.py:27` and `backend/app/services/llm/claude.py:119` is also `provider`.
  - Fix: rename to `cloud_provider` for the cloud side everywhere; LLM side is already implicitly `llm_provider` via `settings.LLM_PROVIDER`. Never bare `provider`.

---

## 3. Claude usage (high-leverage)

The integration is correct but conservative. Each item below is independently shippable.

- 🟠 **P1 — Enable prompt caching on the v1 system prompt.**
  - Code: `backend/app/services/llm/claude.py:158-163` (the `system=SYSTEM_PROMPT` kwarg).
  - Fix: wrap as `system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]`. Pattern already in `backend/app/agents/llm.py:94-100`.
  - Impact: ~90% cost cut on repeat calls (1.5k-token system prompt).

- 🔴 **P1 — Replace "return JSON only" with tool-use structured output.**
  - Code: `backend/app/services/llm/claude.py:158-178`; `backend/app/services/terraform/parser.py:25-92` (the whole parser exists only because v1 asks the model nicely).
  - Fix: define a `submit_terraform` tool (pattern: `backend/app/agents/tools.py:113-136`) and force tool-use (pattern: `backend/app/agents/llm.py:108-110`). Deletes the brace-balancing parser.

- 🔴 **P1 — Run `terraform validate` *inside* an agent loop, not as a post-hoc badge.**
  - Code today: `backend/app/api/routes/generate.py:175-180` (runs validate once, shows result).
  - Fix: the spike already does this in `backend/app/agents/nodes/validate_fix.py:86-145`. Either port the pattern to v1, or accelerate v1 deprecation.

- 🟠 **P2 — Enable extended thinking for diagram → HCL.**
  - Code: `backend/app/services/llm/claude.py:158-163`; `backend/app/agents/llm.py:104-112`.
  - Fix: pass `thinking={"type": "enabled", "budget_tokens": 4096}` on the messages.create call. **Requires SDK bump** (see X7).
  - Impact: vision + complex reasoning is exactly the workload that benefits; likely moves `diagram_match_percent` materially.

- 🟠 **P2 — Build the system prompt dynamically per cloud.**
  - Code: `backend/app/core/prompt_builder.py:30-36` (AWS-specific rules 11-16 are *always* sent — including to Azure/GCP calls).
  - Fix: split `SYSTEM_PROMPT` into a base + per-provider block; assemble in `build_user_message(...)` (or rename to `build_system_prompt(...)`).

- 🟡 **P2 — Stream the response.**
  - Code: `backend/app/services/llm/claude.py:158-163`; `backend/app/agents/llm.py:104-112`.
  - Fix: `client.messages.stream()` instead of `.create()`. UX win on a 30s call.

- 🟡 **P2 — Persist the raw model response.**
  - Code today: only parsed output saved at `backend/app/api/routes/generate.py:184-200`.
  - Fix: add a `raw_response: dict | None` column to `generations` (with new Alembic migration) and write it. Essential for debugging regressions and re-running parsing.

- 🟢 **P3 — Bump `ANTHROPIC_MODEL` default.**
  - Code: `backend/app/core/config.py:24` (currently `"claude-sonnet-4-20250514"`); also `render.yaml`.
  - Fix: confirm latest Sonnet (4.6 / 4.7 as of 2026); bump.

- 🟢 **P3 — Drop the defensive `from anthropic import Anthropic` inside `generate_terraform`.**
  - Code: `backend/app/services/llm/claude.py:131-136`.
  - Fix: dep is pinned in `backend/requirements.txt:9`; just import at module top.

---

## 4. Problem-solving — alternatives to "single LLM call → JSON → 4 files"

The current v1 shape has ceilings; `backend/app/services/templates/aws_microservice/` is the smell that confirms it. The v2 spike addresses some of these; remaining options:

- 🟠 **P1 — Two-stage: Diagram → IR → Terraform.**
  - v2 spike does this internally (Understand → Plan → Synthesize), but the IR is **not exposed for editing**. Show it in the UI so the user can correct it before HCL is written. `correction_note` (today) is a poor substitute.
  - Code: depends on UI work + H2 (re-run from node N) + U4 (bbox).

- 🟠 **P2 — RAG over the Terraform provider schema.**
  - Code (problem): `backend/app/core/prompt_builder.py:30-58` rules 11-23 — hand-curated resource lists age and miss services.
  - Fix: pull provider JSON schema for resources Claude identified; inject into Plan's context (`backend/app/agents/nodes/plan.py:29-39`). New module: `backend/app/services/rag/terraform_schema.py`.

- 🟠 **P2 — Deterministic HCL emitter (CDKTF or a Python HCL writer).**
  - Code: replace `backend/app/agents/nodes/synthesize.py:23-55` LLM call with a graph→HCL transformation.
  - Why: LLM picks resource types + relationships (a graph); deterministic layer writes HCL. Eliminates the class of bugs that `backend/app/services/terraform/parser.py`, `postprocess.py`, and canonical-override exist to mask.

- 🟠 **P2 — Retire or rebuild the canonical-microservice override.**
  - Code: `backend/app/services/templates/aws_microservice/__init__.py:33-99`; called from `backend/app/api/routes/generate.py:134-152`.
  - Today the user submits a diagram, the model writes Terraform reflecting their labels, the system silently replaces it with a generic stub. Fix the generation pipeline (cache + validation loop + IR) so the override is unnecessary; or make the swap explicit and user-visible.

- 🟡 **P3 — Wire feedback into prompt evolution.**
  - Code: `backend/app/db/models.py:74-86` (`Feedback` table); `backend/app/api/routes/feedback.py` (writer); **no reader exists anywhere**.
  - Fix: either delete (YAGNI) or write `scripts/mine_low_rated.py` for a weekly review that surfaces low-rated generations for prompt fixes and few-shot examples.

---

## 5. Agentic architecture — extending the spike

v2 spike has 4 nodes. Full target is 8. State flows through a graph; failed nodes can retry or escalate.

### 5.1 Proposed agents (nodes)

| Agent | Status | Responsibility | Input → Output |
| --- | --- | --- | --- |
| **Diagram Understanding** | ✅ in spike | Pure vision — read every shape, label, arrow, multiplicity | image → `DiagramIR` |
| **Clarifier** | ❌ TODO | Detect ambiguities in IR; auto-resolve or surface to UI | `DiagramIR` → `DiagramIR'` |
| **Resource Mapper** | partial in spike | IR nodes → provider-specific resource types (RAG-backed) | `DiagramIR'` → `ResourcePlan` |
| **Architecture Planner** | ✅ in spike | Order resources, modules vs flat, IAM/SG topology, file split | `ResourcePlan` → `LayoutPlan` |
| **Code Synthesizer** | ✅ in spike | Emit HCL per planned resource | `LayoutPlan` → `Files` |
| **Validator/Fixer** (loop) | ✅ in spike | `terraform validate` + tfsec/checkov; on errors, fixer agent patches and re-runs (≤3 iters) | `Files` → `Files'` |
| **Critique** (parallel) | ❌ TODO | Security + best-practices review as LLM judge | `Files'` → `Critiques` |
| **Explainer** | ❌ TODO | Generate `usage_instructions`, `assumptions`, README-style notes | `Files'` + state → user-facing text |

### 5.2 Implementation TODOs

- 🔴 **P1 — Smoke-test the v2 spike** with a real `ANTHROPIC_API_KEY` and a known diagram. Code is AST-clean and lint-clean but unexercised.
  - Run: see `context.md:42-51` curl example.

- 🔴 **P1 — Benchmark v2 vs v1** on 10–20 diagrams. Metrics: latency, token cost, validate-pass rate, resources-identified accuracy. **If v2 doesn't clearly beat v1, do not ship — investigate.**
  - Code to write: `backend/scripts/benchmark_v1_v2.py`; baseline diagrams in `examples/`.

- 🔴 **P1 — Persist `GenerationTrace`.**
  - Code: add `agent_trace: Mapped[dict | None]` JSON column at `backend/app/db/models.py:46-71`; new migration `backend/alembic/versions/0004_agent_trace.py`; write in `backend/app/api/routes/v2_generate.py:45`.

- 🟠 **P1 — Backfill v1 feature parity in v2 response.**
  - Code: `backend/app/agents/state.py:132-137` (`AgentRunResult`); `backend/app/api/routes/v2_generate.py:23-55`.
  - Fix: map agent trace into `resources_identified`, `assumptions`, `usage_instructions`, `diagram_match_percent` so existing UI reads v2 with no UI change.

- 🟠 **P2 — Add `Clarifier` node.** Confidence-gated; pause when `confidence < 0.7`. **Depends on U3** (per-node confidence).
  - Code to write: `backend/app/agents/nodes/clarify.py`; register in `backend/app/agents/graph.py:42-43`.

- 🟠 **P2 — Add `Critique` node** running parallel to Validator.
  - Code to write: `backend/app/agents/nodes/critique.py`; spawn via `asyncio.gather` from `backend/app/agents/graph.py:45`.

- 🟠 **P2 — Add `Explainer` node** to populate `usage_instructions`.
  - Code to write: `backend/app/agents/nodes/explain.py`.

- 🟠 **P2 — Surface IR + critiques in the UI.** Today user sees match score + advice. With agents, they should see *why* — which node flagged what.
  - Code: new `frontend/src/pages/ResultV2.jsx` + `frontend/src/components/insights/AgentTrace.jsx`.

- 🟡 **P2 — Migrate to LangGraph** once the hand-rolled orchestrator outgrows linear+1-loop. Mapping is 1:1 (see `context.md:328-347`). Don't migrate just because it's fashionable.

- 🔴 **P1 (re-prioritised) — "Rerun from node N" button.** Clarifier change shouldn't re-run vision; fixer iter shouldn't re-run planner.
  - Code: refactor `backend/app/agents/graph.py:30-45` into a `Step` registry; accept `start_from: NodeName, seeded_state: GraphState`.
  - **Was P3; promoted to P1 because it gates HITL entirely (see H2).**

---

## 5b. Reasoning + feedback loops at every step (cross-cutting)

Non-negotiable for the agent rebuild: every node emits an explicit `reasoning` trace, and every node has a feedback channel — automatic (validator → fixer) or HITL (clarifier, mapper, planner). v2 spike implements the reasoning trace; per-node feedback channels are still TODO.

### 5b.1 Per-node reasoning + feedback contract

| Node | Reasoning emitted | Feedback channel |
| --- | --- | --- |
| Diagram Understanding | "I see N nodes, M edges, labels are X, Y, Z; ambiguous icons: …" | User edits IR (rename/add/delete nodes & edges) before pipeline continues |
| Clarifier | "Detected ambiguity in foo; auto-resolved as bar; flagging" | HITL interrupt when confidence < threshold; user accepts/overrides |
| Resource Mapper | "Mapped 'cache' → ElastiCache Redis because diagram says Redis port; alternative DAX rejected because no DynamoDB" | User swaps chosen Terraform resource per IR node |
| Planner | "Placing RDS in private subnet, SG ingress only from web SG, port 5432" | User edits/rejects plan before HCL is written |
| Synthesizer | Per-resource rationale comments in HCL | None (deterministic given plan) |
| Validator/Fixer | "Validate failed with `Reference to undeclared resource X`; fixer added missing variable" | Automatic loop, ≤3 iterations, then escalate |
| Critique | "S3 bucket missing public access block; CloudFront origin uses HTTP not HTTPS" | User accepts/dismisses each warning; dismissals stored as prefs |
| Explainer | Aggregates upstream reasoning into user-facing notes | None |

### 5b.2 Implementation TODOs

- 🔴 **P1 — Persist full reasoning trace to Postgres.**
  - Code: see §5 P1 item 3 above (`agent_trace JSONB`).
  - Surface as a collapsible "Why this code?" panel in `frontend/src/pages/Result.jsx`.

- 🔴 **P1 — Replace the single `correction_note` with per-node feedback endpoints.**
  - Code to write: `POST /api/v2/generation/:id/ir/edit`, `POST /api/v2/generation/:id/plan/edit`, `POST /api/v2/generation/:id/files/edit`, `POST /api/v2/generation/:id/resume` in `backend/app/api/routes/v2_generate.py`.
  - Each edit triggers a partial re-run from that node forward — depends on H2.

- 🟠 **P2 — Confidence thresholds per node that trigger interrupts.**
  - Code: in `backend/app/agents/graph.py:42-45`, branch on `state.trace.<node>.confidence < threshold`.

- 🟠 **P2 — Validator-fixer loop must log every iteration's diff + reasoning,** not just the final result.
  - Code: `backend/app/agents/nodes/validate_fix.py:144-145` already appends per-iter `NodeOutput`; verify the *diff* is preserved (compare current files vs files before fix iteration).

- 🟠 **P2 — Critique dismissals stored per-user as preferences.**
  - Code to write: new `preferences` table; `backend/app/db/models.py`.

- 🟢 **P3 — Reasoning-quality meta-eval.** Score reasoning prose for completeness ("did it mention the rejected alternative?"). Cheap LLM-as-judge.

---

## 6. Context manager + context lake (memory)

Critical layer the v2 spike does **not** address. Without it the agent graph is amnesiac — every run starts from zero, no learning, no preferences, no provenance. Treat as P1 immediately after the spike benchmark passes.

### 6a. Per-run context manager (what each agent sees in its prompt)

- 🟠 **P1 — `ContextBuilder` per node.**
  - Today: each node receives the full upstream artifact (`backend/app/agents/nodes/plan.py:29-33`, `synthesize.py:28-32`, `validate_fix.py:50-61`).
  - Fix: add `backend/app/agents/context.py` with `ContextBuilder.build(state, node_name) -> str` that prunes against a token budget.
  - Needed when ResourcePlan grows past ~50 resources or RAG/critique inject material.

- 🟠 **P1 — `RetrievedContext` typed object.**
  - Shape: `{source: str, content: str, tokens: int, relevance: float}`. Every injected snippet tagged.
  - Code: define in `backend/app/agents/context.py`.

- 🟡 **P2 — `NodeOutput.cited_contexts: list[str]`.**
  - Code: extend `backend/app/agents/state.py:27-36`.
  - Without this, "why did the model choose Aurora?" becomes unanswerable once retrieval is in play.

- 🟡 **P2 — Token accounting per node.**
  - `anthropic.count_tokens` or use `response.usage.input_tokens`. Surface in trace; alert when any node exceeds budget.
  - Code: extend `backend/app/agents/llm.py:84-124` to record usage and return it alongside `tool_input`.

### 6b. Cross-run context lake (memory across runs / users)

- 🔴 **P1 — Semantic memory via pgvector.**
  - Postgres already provisioned. Add pgvector extension; embed each `(DiagramIR, final_files, validation_passed)`. Planner retrieves k similar past runs as few-shot examples.
  - Code to write: `backend/app/services/memory/pgvector.py`; consume from `backend/app/agents/nodes/plan.py`.

- 🟠 **P1 — `MemoryService` facade.**
  - Code to write: `backend/app/services/memory/__init__.py`.
    ```python
    class MemoryService(Protocol):
        async def retrieve_similar(self, ir: DiagramIR, k: int) -> list[PastRun]: ...
        async def get_preferences(self, user_id: str | None) -> Preferences: ...
        async def record_run(self, trace: GenerationTrace, files: TerraformFiles) -> None: ...
    ```

- 🟡 **P2 — Procedural memory: per-user preferences table.**
  - Mined from feedback dismissals + explicit settings. Critique node consults before flagging warnings ("user always wants public S3 in dev").
  - Code to write: `preferences` table in `backend/app/db/models.py`; reader in `backend/app/services/memory/sql_preferences.py`.

- 🟡 **P2 — Mine the `feedback` table.**
  - Code today: writer at `backend/app/api/routes/feedback.py`; no reader.
  - Fix: weekly script or admin UI panel surfacing low-rated generations.

- 🟢 **P3 — Anthropic native `memory` tool for fixer loop.**
  - Requires SDK bump (see X7).
  - Useful for *intra-session* memory during long agent runs (fixer iterations remembering what they tried). Not a substitute for cross-run memory.

- 🟢 **P3 — Memory governance.**
  - Retention policy, per-user opt-out, redaction of secrets before storage.

### 6c. Why this is P1, not later

Without memory, you'll build the next `aws_microservice_canonical` when the agent graph fails on a known-bad-but-common pattern. Vector retrieval of past good runs is the structurally clean version of that override — and generalises to N patterns without code changes.

---

## 7. Smaller fixes

- 🟠 **P1 — `terraform init` is network-bound and synchronous on every request.**
  - Code: `backend/app/services/terraform/cli.py:34-41`.
  - Fix: default `SKIP_TERRAFORM_VALIDATE=true` in `render.yaml` for prod; or move to a background worker.
  - Why: on Render free tier this risks request timeout.

- 🟠 **P2 — Subprocess env leak.**
  - Code: `backend/app/services/terraform/cli.py:33` (`env={**os.environ, "TF_INPUT": "0"}`).
  - Fix: pass minimal env: `env={"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", ""), "TF_INPUT": "0"}`. Avoid leaking `ANTHROPIC_API_KEY` and `AWS_*` to terraform provider plugins.

- 🟢 **P3 — Module-level settings snapshot.**
  - Code: `backend/app/api/routes/generate.py:32` (`_settings = get_settings()` at import).
  - Fix: use the dependency directly inside the route; env edits in dev won't reload until restart today.

- 🟢 **P3 — Standardise error-handling style.**
  - Some places catch broad `Exception` + `logger.exception` (e.g. `backend/app/services/llm/claude.py:164-166`); others raise typed errors. Pick one and apply consistently.

- 🟠 **P3 — Add v2 helper to `frontend/src/services/api.js`.**
  - Code: `frontend/src/services/api.js:76-79` currently has only `generateTerraform()`.
  - Fix: add `generateTerraformV2()` (mirror; hit `/api/v2/generate`) when wiring v2 UI.

- 🟢 **P3 — Sub-package READMEs.**
  - `backend/README.md` and `frontend/README.md` still exist with unique content (env-var table, Foundry setup, Vercel deploy). Either fold into root README or keep as deep-dive references.

- 🟢 **P3 — Rename misspelled shell script.**
  - File: `run_terraketch.sh` (note missing "s").
  - Fix: delete it or rename to match `dev.sh` / `TerraSketch`. Confusing for new contributors.
