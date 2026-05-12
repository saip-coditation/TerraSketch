# TerraSketch

> **Architecture diagram → Terraform code.** Upload a cloud architecture
> diagram (or describe it in text), pick AWS / Azure / GCP, and get
> production-ready Terraform — instantly.

This repo is a monorepo with a **FastAPI backend** that talks to
Anthropic's Claude API and a **React + Vite frontend** with a
Monaco-based code viewer.

```
.
├── backend/           # FastAPI + SQLAlchemy + Alembic + agent graph (v2) + v1 LLM router
├── frontend/          # React + Vite + Tailwind + Monaco
├── examples/          # Sample diagram + generated Terraform (use as benchmark inputs)
├── scripts/           # LAN dev sync helper
├── dev.sh             # Opens backend + Vite + Cloudflare tunnel (GUI terminals)
├── render.yaml        # Render blueprint (backend + free Postgres)
├── context.md         # Handover doc — what was built / decisions / dev follow-ups
├── todo.md            # Backlog — P1/P2/P3 across architecture, Claude usage, memory, etc.
└── README.md
```

The backend uses subpackages under `backend/app/`:

```
app/
├── agents/        # v2 agent graph (understand → plan → synthesize → validate↔fixer)
├── api/routes/    # FastAPI routers — incl. /api/generate (v1) and /api/v2/generate (agents)
├── core/          # config, limiter, security, v1 prompt builder
├── db/            # SQLAlchemy models, Pydantic schemas, session
├── middleware/    # request_id
└── services/
    ├── llm/         # v1 clients (claude, gemini, azure_openai, mock) + router
    ├── terraform/   # parser, postprocess, CLI wrapper, file_diff
    ├── quality/     # diagram_match, secret_scan
    └── templates/   # generation_hints, aws_microservice/ (HCL + loader)
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

SQLAdmin is at [http://127.0.0.1:8000/admin](http://127.0.0.1:8000/admin). In **`APP_ENV=development`**, if `ADMIN_UI_PASSWORD` is unset, the default login is user **`admin`** / password **`terrasketch-dev-admin`** (set `ADMIN_UI_PASSWORD` in `backend/.env` for your own secret; use `ADMIN_UI_ENABLED=false` to turn `/admin` off).

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

### One-command launcher (`dev.sh`)

From the repo root (needs a GUI terminal like GNOME Terminal):

```bash
chmod +x dev.sh
./dev.sh
```

This opens **three** windows: **Uvicorn** on `0.0.0.0:8000`, **Vite** with
`--host 0.0.0.0`, and **Cloudflare quick tunnel** to `http://127.0.0.1:5173`
(after briefly waiting for Vite to respond). Use `./dev.sh
--no-tunnel` if you only want backend + frontend (e.g. LAN testing).

### Public URL (Cloudflare quick tunnel) — manual steps

**1. Frontend env (important)** — In `frontend/.env`, keep the API URL **empty**
so the browser uses the same host as the tunnel and Vite proxies `/api` →
FastAPI:

```bash
VITE_API_URL=
```

Restart `npm run dev` after changing it.

**2. Run the app (two terminals)** — Or use `dev.sh` for these.

- **Terminal A — backend**

  ```bash
  cd backend
  source .venv/bin/activate
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  ```

- **Terminal B — frontend**

  ```bash
  cd frontend
  npm run dev -- --host 0.0.0.0
  ```

Confirm locally: [http://127.0.0.1:5173](http://127.0.0.1:5173) loads and
generate still works.

**3. Start the Cloudflare tunnel** — **Terminal C**

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

In the output, find a line like `https://something-random.trycloudflare.com`.
That is your public link — open it on your phone or share it. The URL changes
every time you restart this command.

**4. If the tunnel site is blocked or you see CORS errors** — The repo’s
`frontend/vite.config.js` already sets `allowedHosts: true` so the
`trycloudflare.com` host is allowed. If you still see API errors, add your
tunnel origin to `backend/.env` **`ALLOWED_ORIGINS`** (comma-separated), e.g.
`https://YOUR-SUBDOMAIN.trycloudflare.com`, then restart Uvicorn.

**`/admin` (SQLAdmin) via the tunnel** — Point **cloudflared at port 5173** (Vite),
not 8000 alone. Vite proxies `/admin` and `/api` to FastAPI and forwards the
real `Host` and `X-Forwarded-Proto` so the admin login and redirects work on
`https://….trycloudflare.com/admin`. Restart **`npm run dev`** after changing
`vite.config.js`. Use `ADMIN_UI_PASSWORD` (or the dev default password in
`APP_ENV=development`) and keep Uvicorn running on 8000.

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

The v1 system prompt lives at
[`backend/app/core/prompt_builder.py`](backend/app/core/prompt_builder.py)
— a single prompt with chain-of-thought triggers and JSON output rules.

The v2 agent graph uses smaller, per-node prompts under
[`backend/app/agents/prompts.py`](backend/app/agents/prompts.py); see
[`context.md`](context.md) for the agentic architecture and handover notes.

## Tech stack

- React 18, Vite 5, Tailwind 3, React Router 6, Monaco editor, JSZip
- FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, slowapi, Pillow
- Anthropic Python SDK (`anthropic>=0.39`)
- PostgreSQL (Render) / SQLite (local)
- Vercel + Render for $0 deploys

## License

Add a license of your choice (MIT recommended for OSS).
