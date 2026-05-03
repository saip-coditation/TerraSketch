# TerraSketch

> **Architecture diagram → Terraform code.** Upload a cloud architecture
> diagram (or describe it in text), pick AWS / Azure / GCP, and get
> production-ready Terraform — instantly.

This repo is a monorepo with a **FastAPI backend** that talks to
Anthropic's Claude API and a **React + Vite frontend** with a
Monaco-based code viewer.

```
.
├── backend/           # FastAPI + SQLAlchemy + Alembic + Anthropic SDK
├── frontend/          # React + Vite + Tailwind + Monaco
├── run_terrasketch.sh # Opens backend + Vite + Cloudflare tunnel (GUI terminals)
├── render.yaml        # Render blueprint (backend + free Postgres)
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

### One-command launcher (`run_terrasketch.sh`)

From the repo root (needs a GUI terminal like GNOME Terminal):

```bash
chmod +x run_terrasketch.sh
./run_terrasketch.sh
```

This opens **three** windows: **Uvicorn** on `0.0.0.0:8000`, **Vite** with
`--host 0.0.0.0`, and **Cloudflare quick tunnel** to `http://127.0.0.1:5173`
(after briefly waiting for Vite to respond). Use `./run_terrasketch.sh
--no-tunnel` if you only want backend + frontend (e.g. LAN testing).

### Public URL (Cloudflare quick tunnel) — manual steps

**1. Frontend env (important)** — In `frontend/.env`, keep the API URL **empty**
so the browser uses the same host as the tunnel and Vite proxies `/api` →
FastAPI:

```bash
VITE_API_URL=
```

Restart `npm run dev` after changing it.

**2. Run the app (two terminals)** — Or use `run_terrasketch.sh` for these.

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

**`/admin` (SQLAdmin) via the tunnel** — With the dev server, Vite proxies
`/admin` to FastAPI (same as `/api`). So you can open
`https://….trycloudflare.com/admin` and e.g.
`https://….trycloudflare.com/admin/user/list` while `ADMIN_UI_PASSWORD` is set
and Uvicorn is running. Restart `npm run dev` after changing `vite.config.js`.

More detail: [`docs/PUBLIC_TUNNEL.md`](docs/PUBLIC_TUNNEL.md).

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
