# TerraSketch

> **Architecture diagram → Terraform code.** Upload a cloud architecture
> diagram (or describe it in text), pick AWS / Azure / GCP, and get
> production-ready Terraform — instantly.

This repo is a monorepo with a **FastAPI backend** and a **React + Vite frontend**.
The backend supports two generation pipelines:

- **v1** — single-shot LLM call → 4 Terraform files. Fast, works with any provider.
- **v2** — 8-node agentic graph (Understand → Clarify → Plan → Synthesize → Validate/Fix → Critique → Explain) with per-node reasoning traces, confidence gating, and HITL edit endpoints.

```
.
├── backend/            # FastAPI + SQLAlchemy + Alembic + v1 pipeline + v2 agent graph
├── frontend/           # React + Vite + Tailwind + Monaco editor
├── examples/           # Sample diagrams + generated Terraform (benchmark inputs)
├── dev.sh              # One-command launcher: backend + Vite + Cloudflare tunnel
├── run_terrasketch.sh  # Alternative launcher script
├── render.yaml         # Render blueprint (backend + free Postgres)
├── context.md          # Handover doc — architecture decisions + dev notes
├── todo.md             # Backlog (all items implemented as of 2026-05-12)
└── CHANGES_SUMMARY.md  # Full changelog of all implemented changes
```

### Backend layout

```
backend/app/
├── agents/             # v2 agent graph
│   ├── graph.py        # Orchestrator with start_from + confidence gating
│   ├── llm.py          # Async LLM wrapper (mock mode, replay cache, extended thinking)
│   ├── hcl_writer.py   # Deterministic HCL emitter (26 resource types, no LLM)
│   ├── context.py      # ContextBuilder + RetrievedContext (token-budgeted prompts)
│   └── nodes/          # clarify, critique, explain, plan, synthesize, understand, validate_fix
├── api/routes/         # FastAPI routers
│   ├── generate.py     # POST /api/generate (v1, GenerationPipeline, async)
│   └── v2_generate.py  # POST /api/v2/generate + all HITL edit endpoints
├── core/               # config, limiter, security, v1 prompt builder (dynamic per-cloud)
├── db/                 # SQLAlchemy models, Pydantic schemas, sync + async sessions
├── middleware/         # request_id
└── services/
    ├── llm/            # claude, gemini, azure_openai, mock clients + async router
    ├── terraform/      # parser, postprocess, cli.py, file_diff
    ├── quality/        # diagram_match (LearnedMatchScorer), secret_scan
    ├── rag/            # terraform_schema.py (27 built-in schemas + registry fallback)
    ├── memory/         # pgvector.py, sql_preferences.py, MemoryService protocol
    └── templates/      # generation_hints, aws_microservice/ canonical HCL
```

## What's inside

### API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/generate` | v1: single-shot Terraform generation (async, tool-use, GenerationPipeline) |
| `POST` | `/api/v2/generate` | v2: agentic 8-node graph generation with per-step reasoning trace |
| `POST` | `/api/v2/generation/{id}/ir/edit` | HITL: replace DiagramIR, re-run from Plan |
| `POST` | `/api/v2/generation/{id}/plan/edit` | HITL: replace ResourcePlan, re-run from Synthesize |
| `POST` | `/api/v2/generation/{id}/files/edit` | HITL: replace files, re-run validation |
| `POST` | `/api/v2/generation/{id}/critique/dismiss` | HITL: dismiss a critique finding as a user preference |
| `GET` | `/api/history` | Last N generations (Bearer or `?session_id=`) |
| `POST` | `/api/feedback` | 1–5 star rating + optional comment |
| `GET` | `/api/health` | Uptime probe |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Sign in → JWT |

### v2 agentic pipeline

```
Image / Text
    │
    ▼
[Understand]  — pure vision: nodes, edges, labels, bboxes, per-node confidence
    │
    ▼
[Clarify]     — resolves ambiguities if confidence < 0.7 (confidence-gated)
    │
    ▼
[Plan]        — IR nodes → typed Terraform resources, edges, per-resource reasoning
    │
    ▼
[Synthesize]  — emits HCL (LLM, deterministic, or hybrid via SYNTHESIZE_MODE)
    │
    ▼
[Validate/Fix]— terraform validate loop (≤ AGENT_MAX_FIX_ITERATIONS), structural drift check
    │
    ▼
[Critique]    — security + best-practice review; filters dismissed user preferences
    │
    ▼
[Explain]     — generates usage_instructions + architecture summary
    │
    ▼
AgentRunResult (files + full GenerationTrace)
```

The full trace is persisted to the `agent_trace` column and surfaced in the frontend's "Why this code?" panel.

### Diagram match scoring

v1 uses the original 545-LOC regex heuristic. v2 uses `LearnedMatchScorer` — a 5-signal weighted scorer:

| Signal | Weight | What it checks |
|---|---|---|
| Resource coverage | 35% | Fraction of planned resources present in generated HCL |
| Variable coverage | 15% | Undeclared variable detection |
| Security penalty | −20% | Broad CIDRs, missing encryption, open IAM |
| Validation bonus | 20% | `terraform validate` result |
| Heuristic base | 10% | Legacy regex heuristic as one input |

## Local development

You need: Python 3.11+, Node 18+, and **one of**: Anthropic API key, Azure OpenAI key, or Gemini key.

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — set LLM_PROVIDER and the matching keys (see backend/README.md)
```

To test the v2 pipeline without any API key, set `AGENT_MOCK_MODE=true` in `.env`.

```bash
uvicorn app.main:app --reload --port 8000
```

SQLAdmin is at [http://127.0.0.1:8000/admin](http://127.0.0.1:8000/admin). Default login in `APP_ENV=development` is **`admin`** / **`terrasketch-dev-admin`** (set `ADMIN_UI_PASSWORD` for your own secret).

The backend defaults to SQLite locally. Run migrations after the first startup if tables already exist:

```bash
alembic stamp 0003_user_auth_columns   # only if DB existed before migrations 0004/0005
alembic upgrade head
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL empty = Vite proxy to localhost:8000
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).

### One-command launcher

```bash
chmod +x dev.sh
./dev.sh                 # backend + Vite + Cloudflare tunnel
./dev.sh --no-tunnel     # backend + Vite only (LAN testing)
```

### Cloudflare quick tunnel (public URL)

1. Set `VITE_API_URL=` (empty) in `frontend/.env` so Vite proxies `/api` to FastAPI.
2. Run backend on `0.0.0.0:8000`, frontend on `0.0.0.0:5173`.
3. `cloudflared tunnel --url http://127.0.0.1:5173` — share the `trycloudflare.com` URL.

If you get CORS errors, add the tunnel origin to `ALLOWED_ORIGINS` in `backend/.env` and restart Uvicorn.

### Utility scripts

```bash
cd backend

# Verify extended thinking works with your Anthropic key
ANTHROPIC_API_KEY=... python scripts/verify_extended_thinking.py

# Compare v1 vs v2 on benchmark diagrams
ANTHROPIC_API_KEY=... python scripts/benchmark_v1_v2.py

# Read low-rated generations for prompt improvement ideas
DATABASE_URL=... python scripts/mine_low_rated.py

# LLM-assisted prompt retraining from feedback
DATABASE_URL=... ANTHROPIC_API_KEY=... python scripts/feedback_retraining.py
```

## Deploying for free

| Layer | Host | Free tier |
|---|---|---|
| Frontend | **Vercel** | Unlimited personal projects, free SSL |
| Backend | **Render** Web Service | Spins down after 15 min, wakes on request |
| Database | **Render** PostgreSQL | 1 GB storage, 90-day retention |
| AI | Anthropic / Azure OpenAI / Gemini | Pay-per-use |

### Backend (Render)

1. Push this repo to GitHub.
2. On Render, "New +" → "Blueprint" → point at this repo. `render.yaml` provisions a web service + Postgres DB.
3. Set `LLM_PROVIDER` and the provider key(s) in the web service environment.
4. From the Render shell: `alembic upgrade head`.

### Frontend (Vercel)

1. Import the repo in Vercel, set project root to `frontend/`.
2. Set `VITE_API_URL=https://<your-backend>.onrender.com`.
3. Push to `main` — Vercel auto-deploys.

## Tech stack

| Layer | Libraries |
|---|---|
| Frontend | React 18, Vite 5, Tailwind 3, React Router 6, Monaco editor, JSZip, Axios |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, slowapi, Pillow, aiosqlite, asyncpg |
| AI | `anthropic>=0.50,<1.0`, `openai` (Azure), `google-generativeai` (Gemini) |
| Database | PostgreSQL (Render) / SQLite (local), pgvector (optional semantic memory) |
| Deploy | Vercel + Render |

## Key environment variables

See [backend/README.md](backend/README.md) for the full table. Quick reference:

| Variable | What it does |
|---|---|
| `LLM_PROVIDER` | `anthropic`, `azure`, `gemini`, or `mock` |
| `ANTHROPIC_API_KEY` | Required if `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_EXTENDED_THINKING` | `true` to enable Claude extended thinking |
| `ANTHROPIC_STREAM` | `true` to stream responses |
| `AGENT_MOCK_MODE` | `true` to run v2 pipeline without any API key |
| `SYNTHESIZE_MODE` | `llm` (default), `deterministic`, or `hybrid` |
| `SKIP_TERRAFORM_VALIDATE` | `true` in prod (prevents network-bound `terraform init`) |
| `AGENT_MAX_FIX_ITERATIONS` | Max validate-fix loop iterations (default `3`) |
| `V1_VALIDATE_FIX_ENABLED` | `true` to enable validate-fix loop in v1 |
| `CANONICAL_OVERRIDE_ENABLED` | `false` to disable the AWS microservice canonical override |

## License

Add a license of your choice (MIT recommended for OSS).
