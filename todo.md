# TerraSketch — TODO

Open items only. Pre-handoff cleanup (services restructure, HCL extraction,
repo-root tidy, lint setup, v2 spike) is summarized in `context.md`.

**P1** = high-impact / quick win. **P2** = meaningful but more work.
**P3** = nice-to-have.

---

## 1. Architecture

- [ ] **P1 — Break up `routes/generate.py` (200-line god-route).**
  Extract a `GenerationPipeline` with composable stages (postprocess, canonical
  override, match score, secret scan, diff, validate). Today adding/removing a
  check means editing the route handler.
- [ ] **P1 — Don't silently swallow provider mismatch.**
  `routes/generate.py:116` logs and continues when `ai_output.provider !=
  payload.cloud_provider`. Should 502 — that's a generation failure.
- [ ] **P2 — Move to async path.**
  Routes are sync, SDK call is blocking, DB is sync. Switch to `AsyncAnthropic`
  + async DB session + `async def` routes; matches FastAPI idiom and scales
  better for 30-second LLM calls.

---

## 2. Naming

- [ ] **P2 — Disambiguate "provider".**
  Used for both cloud provider (aws/azure/gcp) and LLM provider
  (anthropic/gemini/azure). Consider `cloud_provider` everywhere on the cloud
  side and `llm_provider` everywhere on the LLM side; never bare `provider`.

---

## 3. Claude usage (high-leverage)

The integration is correct but conservative. Each item below is independently
shippable.

- [ ] **P1 — Enable prompt caching on the system prompt.**
  ~1.5k-token system prompt is sent every request. Add
  `cache_control: {"type": "ephemeral"}` on the system block — typically cuts
  repeat-call cost ~90%.
- [ ] **P1 — Replace "return JSON only" with tool-use structured output.**
  Define a `submit_terraform` tool with the exact JSON schema. Model is then
  *required* to emit valid JSON. Eliminates `_extract_json_block` and the entire
  brace-matching parser in `services/terraform/parser.py`.
- [ ] **P1 — Run `terraform validate` *inside* an agent loop, not as a post-hoc
  badge.** Today validate runs once after generation and the result is shown to
  the user. Better: if validate errors, feed them back as a tool-result and ask
  Claude to fix (cap at 2–3 turns). Standard Claude tool-use pattern; addresses
  most of what `terraform/postprocess.py` and the canonical override exist to
  paper over. (v2 spike already implements this — apply pattern to v1 too.)
- [ ] **P2 — Enable extended thinking for diagram → HCL.**
  Vision + complex reasoning is exactly the workload that benefits. Sonnet/Opus
  4.x support it. Likely moves `diagram_match_percent` materially.
- [ ] **P2 — Build the system prompt dynamically per provider.**
  Rules 11–16 in `core/prompt_builder.py` are AWS-specific but currently shipped
  to azure/gcp calls too. Inject only the target-provider rules.
- [ ] **P2 — Stream the response.**
  `client.messages.stream()` to dribble out partial JSON. UX win on a 30s call.
- [ ] **P2 — Persist the raw model response.**
  Today only parsed/structured output is saved. Storing raw JSON (and thinking
  blocks) is essential for debugging quality regressions and re-running parsing
  against history.
- [ ] **P3 — Bump `ANTHROPIC_MODEL` default.**
  Confirm it points at the latest Sonnet (4.6 / 4.7 as of 2026), not
  `claude-sonnet-4-20250514` from `render.yaml` and `config.py`.
- [ ] **P3 — Drop the defensive `from anthropic import Anthropic` inside
  `services/llm/claude.py:generate_terraform`.** Dependency is pinned in
  `requirements.txt`; just import at module top.

---

## 4. Problem-solving — alternatives to "single LLM call → JSON → 4 files"

The current v1 shape has ceilings, and `services/templates/aws_microservice/`
(the canonical override) is the smell that confirms it. The v2 spike addresses
some of these; remaining options:

- [ ] **P1 — Two-stage: Diagram → IR → Terraform.**
  v2 spike does this internally (Understand → Plan → Synthesize) but the IR is
  not yet exposed to the user for editing. Show it in the UI so the user can
  *correct it* before HCL is written. (`correction_note` today is a poor substitute.)
- [ ] **P2 — RAG over the Terraform provider schema.**
  Hand-curated resource lists in the system prompt (~25 AWS, ~14 Azure, ~14 GCP)
  age and miss services. Pull provider JSON schema for resources Claude
  identified, inject into context. Kills deprecated-argument errors and extends
  coverage without prompt edits.
- [ ] **P2 — Deterministic HCL emitter (CDKTF or a Python HCL writer).**
  Let the LLM pick resource types + relationships (a graph); deterministic layer
  writes HCL. Eliminates the class of bugs that `terraform/parser.py` +
  `terraform/postprocess.py` + canonical-override exist to mask.
- [ ] **P2 — Retire or rebuild the canonical-microservice override.**
  As shipped, a user submits a diagram, model writes Terraform reflecting their
  labels, system silently replaces it with a generic stub. Fix the generation
  pipeline (cache + validation loop + IR) so the override is unnecessary; or
  make the swap explicit and user-visible.
- [ ] **P3 — Wire feedback into prompt evolution.**
  `feedback` table collects 1–5 stars, but nothing reads it. Either delete (YAGNI)
  or set up a weekly review that mines low-rated generations for prompt fixes
  and few-shot examples.

---

## 5. Agentic architecture — extending the spike

v2 spike has 4 nodes (Understand → Plan → Synthesize → Validate-with-fixer).
Full target is 8 nodes. State flows through a graph; failed nodes can retry
or escalate.

### Proposed agents (nodes)

| Agent | Status in spike | Responsibility | Input → Output |
|---|---|---|---|
| **Diagram Understanding** | ✅ in spike | Pure vision — read every shape, label, arrow, multiplicity | image → `DiagramIR` |
| **Clarifier** | ❌ TODO | Detect ambiguities in IR; auto-resolve with conventions or surface to UI | `DiagramIR` → `DiagramIR'` |
| **Resource Mapper** | partial in spike | Translate IR nodes → provider-specific resource types (RAG-backed) | `DiagramIR'` → `ResourcePlan` |
| **Architecture Planner** | ✅ in spike | Order resources, decide modules vs flat, plan IAM/SG topology, file split | `ResourcePlan` → `LayoutPlan` |
| **Code Synthesizer** | ✅ in spike | Emit HCL per planned resource | `LayoutPlan` → `Files` |
| **Validator/Fixer** (loop) | ✅ in spike | Run `terraform validate` + tfsec/checkov; on errors, fixer agent patches and re-runs (max 3 iters) | `Files` → `Files'` |
| **Critique** (parallel) | ❌ TODO | Security + best-practices review as an LLM judge | `Files'` → `Critiques` |
| **Explainer** | ❌ TODO | Generate `usage_instructions`, `assumptions`, README-style notes | `Files'` + state → user-facing text |

### Implementation TODOs

- [ ] **P1 — Smoke-test the v2 spike** with a real `ANTHROPIC_API_KEY` and a known
  diagram. The code is AST-clean and lint-clean but unexercised. Expect to
  surface a tool-schema or Pydantic-construction issue on the first run.
- [ ] **P1 — Benchmark v2 vs v1** on a fixed test set of 10–20 diagrams (use
  `examples/simple_web/` as one). Metrics: latency, token cost, validate-pass
  rate, resources-identified accuracy. **If v2 doesn't clearly beat v1, do not
  ship — investigate.** This is the gate.
- [ ] **P1 — Persist `GenerationTrace`.** Add an `agent_trace JSONB` column on
  `generations` via Alembic. Update the v2 route to write it on success.
- [ ] **P1 — Backfill v1 feature parity in v2 response.** Map agent trace into
  `resources_identified`, `assumptions`, `usage_instructions`, `diagram_match_percent`
  so existing UI can read v2 with no UI change.
- [ ] **P2 — Add `Clarifier` node.** Confidence-gated; pause for HITL when
  `confidence < 0.7`.
- [ ] **P2 — Add `Critique` node** running parallel to validator.
- [ ] **P2 — Add `Explainer` node** to populate `usage_instructions` (currently
  empty in v2).
- [ ] **P2 — Surface IR + critiques in the UI.** Today the user sees a match
  score + advice. With agents, they see *why* — which node flagged what.
- [ ] **P2 — Migrate to LangGraph** once the hand-rolled orchestrator outgrows
  linear+1-loop. Mapping is one-to-one (see `context.md` §4 LangGraph migration).
  Don't migrate just because it's fashionable.
- [ ] **P3 — "Rerun from node N" button.** Clarifier change shouldn't re-run
  vision; fixer iteration shouldn't re-run planner.

---

## 5b. Reasoning + feedback loops at every step (cross-cutting)

Non-negotiable for the agent rebuild: every node emits an explicit `reasoning`
trace, and every node has a feedback channel — automatic (validator → fixer)
or human-in-the-loop (clarifier, mapper, planner). v2 spike implements the
reasoning trace; the per-node feedback channels are still TODO.

### Per-node reasoning + feedback contract

| Node | Reasoning emitted | Feedback channel |
|---|---|---|
| Diagram Understanding | "I see N nodes, M edges, labels are X, Y, Z; ambiguous icons: …" | User can edit the IR (rename/add/delete nodes & edges) before pipeline continues |
| Clarifier | "Detected ambiguity in foo; auto-resolved as bar; flagging" | HITL interrupt when confidence < threshold; user accepts/overrides |
| Resource Mapper | "Mapped 'cache' → ElastiCache Redis because diagram says Redis port; alternative DAX rejected because no DynamoDB shown" | User can swap chosen Terraform resource per IR node |
| Planner | "Placing RDS in private subnet, SG ingress only from web SG, port 5432" | User can edit/reject the plan before HCL is written |
| Synthesizer | Per-resource rationale comments emitted into HCL itself | None (deterministic given plan) |
| Validator/Fixer | "Validate failed with `Reference to undeclared resource X`; fixer added missing variable" | Automatic loop, max 3 iterations, then escalate |
| Critique | "S3 bucket missing public access block; CloudFront origin uses HTTP not HTTPS" | User accepts/dismisses each warning; dismissals stored as preferences |
| Explainer | Aggregates upstream reasoning into user-facing usage notes | None |

### Implementation TODOs

- [ ] **P1 — Persist full reasoning trace to Postgres** (`agent_trace JSONB` on
  `generations`). Surface as a collapsible "Why this code?" panel in the UI.
- [ ] **P1 — Replace the single `correction_note` with per-node feedback
  endpoints**: `POST /api/v2/generation/:id/ir/edit`, `.../plan/edit`, etc.
  Each edit triggers a partial re-run from that node forward, not a full regen.
- [ ] **P2 — Add `confidence` thresholds per node that trigger interrupts**:
  if Clarifier confidence < 0.7, pause and ask user before continuing.
- [ ] **P2 — Validator-fixer loop must log every iteration's diff + reasoning**
  not just the final result. Debugging "why did this take 3 iterations?"
  should be one query away. (Spike captures per-iteration `NodeOutput`; verify
  diff is preserved in trace persistence.)
- [ ] **P2 — Critique dismissals stored per-user as preferences** (e.g.
  "I always want public S3 buckets in dev"); future critiques respect them.
- [ ] **P3 — Reasoning quality is itself reviewable**: add a meta-eval that
  scores reasoning prose for completeness ("did it mention the rejected
  alternative?"). Cheap LLM-as-judge.

---

## 6. Context manager + context lake (memory)

Critical layer the v2 spike does **not** address. Without it the agent
graph is amnesiac — every run starts from zero, no learning, no
preferences, no provenance. Treat as P1 immediately after the spike
benchmark passes. Two distinct concerns:

### 6a. Per-run context manager (what each agent sees in its prompt)

- [ ] **P1 — `ContextBuilder` per node.**
  Today each node receives the full upstream artifact. Add a builder that
  selects + prunes against a token budget. Required when ResourcePlan grows
  past ~50 resources or when RAG / critique inject more material.
- [ ] **P1 — `RetrievedContext` typed object.**
  `{source, content, tokens, relevance}`. Every injected snippet is tagged.
- [ ] **P2 — `NodeOutput.cited_contexts: list[str]`.**
  So reasoning can be traced back to specific injected context. Without
  this, "why did the model choose Aurora?" becomes unanswerable once
  retrieval is in play.
- [ ] **P2 — Token accounting per node.**
  `anthropic.count_tokens` or response usage. Surface in trace; alert when
  any node exceeds budget.

### 6b. Cross-run context lake (memory across runs / users)

- [ ] **P1 — Semantic memory via pgvector.**
  Postgres already provisioned. Add pgvector extension. Embed each
  `(DiagramIR, final_files, validation_passed)`. Planner retrieves k
  similar past runs as few-shot examples.
- [ ] **P1 — `MemoryService` facade.**
  Single Protocol so nodes don't know which backend.
  ```python
  class MemoryService(Protocol):
      async def retrieve_similar(ir: DiagramIR, k: int) -> list[PastRun]: ...
      async def get_preferences(user_id: str | None) -> Preferences: ...
      async def record_run(trace: GenerationTrace, files: TerraformFiles) -> None: ...
  ```
- [ ] **P2 — Procedural memory: per-user preferences table.**
  Mined from feedback dismissals + explicit settings. Critique node
  consults before flagging warnings ("user always wants public S3 in dev").
- [ ] **P2 — Mine the `feedback` table.**
  Low-rated generations → flagged examples for prompt evolution. Either
  manual weekly review or automated extraction.
- [ ] **P3 — Anthropic native `memory` tool for fixer loop.**
  File-system-backed scratchpad, useful for *intra-session* memory during
  long agent runs (e.g. fixer iterations remembering what they tried).
  Not a substitute for cross-run memory.
- [ ] **P3 — Memory governance.**
  Retention policy, per-user opt-out, redaction of secrets before storage.

### Why this is P1, not later

Without memory, you'll build the next `aws_microservice_canonical`
when the agent graph fails on a known-bad-but-common pattern. Vector
retrieval of past good runs is the structurally clean version of that
override — and it generalises to N patterns without code changes.

---

## 7. Smaller fixes

- [ ] **P1 — `terraform init` is network-bound and synchronous on every request.**
  `services/terraform/cli.py` runs in the foreground. On Render free tier
  this risks request-timeout. Move to a background worker, or default
  `SKIP_TERRAFORM_VALIDATE=true` in production.
- [ ] **P2 — Subprocess env leak.**
  `services/terraform/cli.py` passes `{**os.environ, ...}` to terraform
  subprocesses, exposing `ANTHROPIC_API_KEY` and `AWS_*` to provider plugins.
  Pass an explicit minimal env (`PATH`, `HOME`, `TF_INPUT`).
- [ ] **P3 — Module-level settings snapshot.**
  `routes/generate.py:28` does `_settings = get_settings()` at import. Env
  edits in dev won't reload until restart. Use the dependency directly inside
  the route.
- [ ] **P3 — Standardise error-handling style.**
  Some places catch broad `Exception` + `logger.exception`; others raise typed
  errors. Pick one and apply consistently.
- [ ] **P3 — Add v2 helper to `frontend/src/services/api.js`.**
  Today only `generateTerraform()` exists, which calls v1. Add `generateTerraformV2()`
  when wiring the v2 UI.
- [ ] **P3 — Sub-package READMEs.**
  `backend/README.md` and `frontend/README.md` still exist with unique content
  (env-var table, Foundry setup, Vercel deploy). Either fold into root README
  or keep as deep-dive references.
