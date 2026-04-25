# TerraSketch

> **Architecture diagram → Terraform code.** Upload a cloud architecture
> diagram (or describe it in text), pick AWS / Azure / GCP, and get
> production-ready Terraform — instantly.

This repo is a monorepo with a **FastAPI backend** that talks to
Anthropic's Claude API and a **React + Vite frontend** with a
Monaco-based code viewer.

```
.
├── backend/    # FastAPI + SQLAlchemy + Alembic + Anthropic SDK
├── frontend/   # React + Vite + Tailwind + Monaco
├── render.yaml # Render blueprint (backend + free Postgres)
└── README.md
```

## What's inside

- **`POST /api/generate`** — accepts an image (base64) or text
  description and returns a structured object with
  `main.tf`, `variables.tf`, `outputs.tf`, `providers.tf`, the list of
  resources Claude identified, and any assumptions it made.
- **`GET /api/history?session_id=…`** — last N generations for an
  anonymous browser session.
- **`POST /api/feedback`** — 1–5 star rating + optional comment per
  generation.
- **`GET /api/health`** — for uptime probes (Render's free tier
  spins down after 15 min of inactivity).
- A polished, dark, gradient-y frontend with a custom HCL Monaco
  language definition.

## Local development

You need: Python 3.11+, Node 18+, an Anthropic API key.

### 1. Start the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-…

uvicorn app.main:app --reload --port 8000
```

The backend defaults to a local SQLite DB (`terrasketch.db`). Tables
are created automatically on first run.

### 2. Start the frontend

```bash
cd frontend
npm install

cp .env.example .env  # VITE_API_URL defaults to http://localhost:8000
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).

## Deploying for free

| Layer | Host | Free tier |
|---|---|---|
| Frontend | **Vercel** | Unlimited personal projects, free SSL |
| Backend | **Render** Web Service | Spins down after 15 min, wakes on request |
| Database | **Render** PostgreSQL | 1 GB storage, 90 day retention |
| AI | **Anthropic Claude** | Pay-per-use; ~\$0.01 per generation |

Total infra cost: **\$0/month**, plus a few cents in Claude tokens per
generation. A simple `5/minute` rate limiter is enabled by default to
keep costs predictable.

### Backend (Render)

1. Push this repo to GitHub.
2. On Render, "New +" → "Blueprint" and point it at this repo. The
   included `render.yaml` provisions a web service + Postgres DB.
3. Once it's up, set `ANTHROPIC_API_KEY` and `ALLOWED_ORIGINS` in the
   web service environment.
4. From the Render shell run `alembic upgrade head` (or just rely on
   the auto-create on startup for SQLite-style local dev).

### Frontend (Vercel)

1. Import the repo in Vercel, set project root to `frontend/`.
2. Set env var `VITE_API_URL=https://<your-backend>.onrender.com`.
3. Push to `main` — Vercel auto-deploys on every push.

## The Super Prompt

The system prompt sent to Claude lives at
[`backend/app/core/prompt_builder.py`](backend/app/core/prompt_builder.py).
It's the production-grade prompt described in
`IMP_TerraSketch_ProductDocument.md`, with chain-of-thought triggers
and explicit JSON output formatting baked in.

## Tech stack

- React 18, Vite 5, Tailwind 3, React Router 6, Monaco editor, JSZip
- FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, slowapi, Pillow
- Anthropic Python SDK (`anthropic>=0.39`)
- PostgreSQL (Render) / SQLite (local)
- Vercel + Render for $0 deploys

## License

Add a license of your choice (MIT recommended for OSS).
