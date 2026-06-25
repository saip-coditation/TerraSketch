# TerraSketch — Deploy-to-AWS Design

Status: **Design (Phase A)** — to review before building the MVP (Phase B).

Lets a user deploy a generated Terraform stack to **their own AWS account**
directly from TerraSketch, and destroy it again. This is a deliberate expansion
beyond the "first-draft generator" goal into deploy/management territory, so the
security model matters a lot.

## 1. Credential model — transient keys, never stored

- The user enters **AWS Access Key ID + Secret Access Key** (+ optional session
  token, + region) **at deploy time** and again **at destroy time**.
- Sent over HTTPS, held **in memory only** for the duration of the Terraform run,
  injected as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars to the
  Terraform subprocess.
- **Never** written to disk, **never** logged, **never** persisted to the DB.
- Because keys aren't stored, the user re-enters them to destroy. (Acceptable
  for the demo; a later option is a cross-account IAM role for repeat use.)
- Recommend the user create a **dedicated, least-privilege IAM user** for this.

## 2. What IS persisted: the deployment + its state

To destroy later we must keep the **Terraform state** — but state can be kept
*without* the credentials.

New DB model `Deployment`:

| field | notes |
| --- | --- |
| `id` | uuid |
| `generation_id` | source generation |
| `user_id` / `session_id` | owner |
| `status` | `applying` / `applied` / `destroying` / `destroyed` / `error` |
| `region` | target region |
| `tf_state` | **encrypted at rest** (state can contain secrets) |
| `outputs` | terraform outputs (scrubbed) |
| `logs` | apply/destroy logs (credentials scrubbed) |
| `error` | last error, if any |
| `created_at` / `updated_at` | |

State encryption: symmetric key from env (`DEPLOY_STATE_KEY`); never commit it.

## 3. Execution backend (the Terraform worker)

`terraform apply` is **long-running and memory-heavy** → it cannot run inline on
the free-tier web box (512 MB → OOM). Design:

- A background job runs: write the generation's `.tf` + saved state to an
  isolated temp dir → `terraform init` → `terraform apply -auto-approve` (or
  `destroy`) with creds as env vars → capture incremental logs → save the new
  encrypted state + outputs → update status.
- **Hosting prerequisite:** a host with Terraform CLI installed and enough
  RAM/CPU (a paid Render instance or a separate worker service). The Dockerfile
  already installs Terraform-adjacent tooling; we add the Terraform CLI.
- MVP can run jobs **sequentially** (no queue) to keep it simple; isolation via
  per-job temp dirs.

## 4. API

| method | path | purpose |
| --- | --- | --- |
| `POST` | `/api/deploy` | body: `{ generation_id, region, aws_access_key_id, aws_secret_access_key, session_token? }` → creates a `Deployment`, starts apply, returns `deployment_id` |
| `GET` | `/api/deploy/{id}` | status + outputs + incremental logs (UI polls this) |
| `POST` | `/api/deploy/{id}/destroy` | body: `{ aws_access_key_id, aws_secret_access_key, confirm }` → runs destroy from saved state |

Credentials appear **only** in request bodies, never in responses or logs.

## 5. UI (result page → "Deploy" flow)

1. **Deploy to AWS** button on the result page.
2. Modal: region select + access key + secret key inputs, a least-privilege
   note, and a clear **cost/charges warning**.
3. Live status + streaming logs panel (polls `/api/deploy/{id}`).
4. On success: show Terraform **outputs** (e.g. URLs, IDs).
5. **Destroy** button on an applied deployment → modal **requires re-entering
   keys + an explicit confirm** ("type DESTROY") before running.

## 6. Security guardrails (non-negotiable)

- HTTPS only; keys never stored/logged; **scrub** any key-like strings from logs.
- Explicit **confirm-to-destroy**.
- Recommend/least-privilege IAM; document the minimal policy.
- Per-user job isolation; rate-limit deploys.
- Optional next step: `terraform plan` preview shown **before** apply.

## 7. Phasing

- **Phase A — this design.** Review with Sir.
- **Phase B — demo MVP** (on the demo AWS account):
  - `Deployment` model + migration, encrypted state.
  - `/api/deploy`, `/api/deploy/{id}`, `/api/deploy/{id}/destroy`.
  - Background apply/destroy runner with log capture + key scrubbing.
  - Result-page Deploy modal, live logs, outputs, confirm-to-destroy.
  - Terraform CLI in the image; **runs on a non-free host**.
- **Phase C — hardening (later):** `plan` preview, cross-account IAM role option,
  job queue/concurrency, cost estimation gate, state in the user's own S3.

## 8. Prerequisites to start Phase B

1. A **non-free host** (or worker) with Terraform CLI + adequate RAM.
2. `DEPLOY_STATE_KEY` env var (state encryption).
3. The **demo AWS account** keys for testing (entered in the UI, not committed).
