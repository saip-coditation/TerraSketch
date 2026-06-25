# TerraSketch Terraform worker

Runs on a small AWS box (free-tier `t3.micro`). Polls the TerraSketch backend
for deploy jobs and runs `terraform apply` / `destroy` using the **user's
transient AWS credentials** (passed per job, never stored). The box can live in
any AWS account — the account Terraform deploys *into* is decided by the
credentials in each job, not by where this box runs.

## Run locally (for testing)

```bash
pip install -r requirements.txt
export BACKEND_URL=https://terrasketch.onrender.com
export WORKER_TOKEN=<same secret you set on the backend>
python agent.py
```

## Run on EC2

The instance's **user-data** script installs Terraform + this agent and starts
it as a `systemd` service (`terrasketch-worker`). See the deploy design doc and
the launch steps. Config lives in `/etc/terrasketch-worker.env`; logs:
`journalctl -u terrasketch-worker -f`.

## Backend contract

- `GET  /api/worker/next-job` → `204` idle, or a job `{ id, action, region, files, state, aws_access_key_id, aws_secret_access_key, aws_session_token? }`
- `POST /api/worker/jobs/{id}` → `{ status?, log_append?, outputs?, state?, error? }`

Both require `Authorization: Bearer $WORKER_TOKEN`. Credentials are scrubbed from
all logs before they're sent back.
