# Plan: reliable image → Terraform → live infrastructure

Goal: a user uploads an architecture **diagram**, and TerraSketch reliably
generates Terraform **and deploys working infrastructure** matching the diagram
on their AWS account.

Think of reliability as a chain — the weakest link caps the result:

```
Image understanding × Code validity × Deployability × Apply success × Verification
```

Today we're strong on **code validity** (validate → AI-fix loop) and the deploy
pipeline works (worker, transient keys, apply/destroy). The weak links are
**image understanding**, **apply-time success**, and **verification**. This plan
attacks them in order of impact-per-effort.

---

## Phase 1 — Harden the deploy loop (small, high impact)

`terraform validate` catches config errors but **not** provider/plan errors
(bad AMI for the region, IAM/quota issues, naming conflicts). Extend the
self-heal loop:

1. After validate passes, run **`terraform plan`** (uses the creds, creates
   nothing). Feed any plan error into the same AI-fix loop.
2. If **`apply`** fails partway, capture the error → AI-fix → `plan` → retry
   apply (1–2 times).
3. Region-aware AMIs: ensure `data.aws_ami` filters resolve in the chosen region.
4. Guardrails: per-deploy resource cap + timeout; surface clear errors.

**Outcome:** most "validate-passes-but-apply-fails" cases self-heal.

## Phase 2 — Improve image fidelity (two-stage + confirm)

Image→Terraform in one shot is the biggest source of *wrong* infra. Split it:

1. **Vision → structured spec:** the model extracts a JSON architecture spec
   from the image (components, types, connections, key properties) — not code.
2. **Human checkpoint:** show the parsed architecture (component list + rendered
   diagram) and let the user **confirm or correct** before generating.
3. **Spec → Terraform:** generate from the confirmed spec (far more constrained
   and accurate than free-form image→code).

*(The v2 agentic path already produces a `diagram_ir` — we can productize that
instead of building from scratch.)*

**Outcome:** the deployed infra actually matches the diagram; the user catches
misreads before anything is built.

## Phase 3 — Deployable-by-construction (vetted module library)

For known patterns, stop free-forming HCL and **assemble from tested modules**:

- Curate battle-tested Terraform modules for common blocks: VPC, ALB+ECS Fargate,
  RDS, S3+CloudFront, Lambda+API Gateway, EKS.
- Map recognized diagram components → these modules; the LLM wires inputs, not
  raw resources.

**Outcome:** for supported patterns, apply success approaches 100% because the
building blocks are pre-validated.

## Phase 4 — Verification & assurance (prove it works)

1. **Post-apply check:** compare created resources to the intended spec; show the
   user "created N of M expected components" + any gaps.
2. **Reference-diagram test harness:** a fixed set of sample diagrams run
   nightly/on-demand through generate → deploy → verify → destroy, tracking a
   **pass rate** per pattern. This is how we *assure* it keeps working and catch
   regressions.

**Outcome:** a measurable reliability number, not a vibe.

---

## Honest constraints
- Vision models misread some diagrams — the Phase 2 confirm step is the mitigation, not a cure.
- Some diagrams imply **external** resources (an existing VPC, a real domain, an ACM cert) that can't be auto-created — the tool should detect these and ask the user for the value rather than guess.
- Free-tier Render + a single worker is fine for a demo; scale needs a job queue and a bigger/worker fleet later.

## Recommended order
1. **Phase 1** now — extend the loop to `plan` + `apply` (biggest reliability gain for least work; builds directly on what exists).
2. **Phase 2** next — the confirm step; this is what makes image deploys trustworthy.
3. Phase 3/4 as the product matures.
