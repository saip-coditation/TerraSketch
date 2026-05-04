# TerraSketch Backend (FastAPI)

The backend API that powers TerraSketch — accepts an architecture
diagram (image) or a text description, calls a configurable LLM
(Anthropic, Google Gemini, or **Azure OpenAI / Microsoft Foundry GPT-4o**),
and returns production-ready Terraform code for AWS / Azure / GCP.

## Stack

- **FastAPI** + **Uvicorn**
- **SQLAlchemy 2.x** + **Alembic** migrations
- **PostgreSQL** in production (Render free tier), **SQLite** locally
- **Anthropic Claude**, **Google Gemini**, or **Azure OpenAI (GPT-4o)** via `LLM_PROVIDER`
- **slowapi** for IP-based rate limiting

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env: set LLM_PROVIDER and the matching keys (see table below).

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the
interactive OpenAPI / Swagger UI.

### Admin UI (like Django admin)

FastAPI has no built-in admin. This project uses **[SQLAdmin](https://github.com/aminalaee/sqladmin)** so you can browse **Users**, **Generations**, and **Feedback** in the browser.

1. In `backend/.env` set **`ADMIN_UI_PASSWORD`** (and optionally **`ADMIN_UI_USER`**, default `admin`). Use a strong password in production.
2. Restart Uvicorn.
3. Open **`http://localhost:8000/admin`** (or your API host), sign in with that username/password.

If `ADMIN_UI_PASSWORD` is empty, `/admin` is **not** mounted. Plain-text passwords are **not** stored; the User detail view shows **`password_hash`** only.

The first time you run it (with the default SQLite `DATABASE_URL`),
tables are created automatically on startup. If the DB already exists but
Alembic has never run, stamp the current schema then upgrade:

```bash
alembic stamp 0001_initial
alembic upgrade head
```

### Open the app on your phone over the internet

Use a Cloudflare Quick Tunnel — `cloudflared tunnel --url http://127.0.0.1:5173`. The repo's `dev.sh` automates this. See the root `README.md` "Public URL" section for full steps.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | no | `anthropic` | `anthropic`, `gemini`, `azure`, or `mock` |
| `LLM_FALLBACK_PROVIDER` | no | `mock` | When `mock`, quota/rate-limit errors fall back to template output |
| `ANTHROPIC_API_KEY` | if `LLM_PROVIDER=anthropic` | — | Claude API key |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-20250514` | Model to call |
| `GEMINI_API_KEY` | if `LLM_PROVIDER=gemini` | — | Google AI Studio / Gemini API key |
| `GEMINI_MODEL` | no | `gemini-2.0-flash` | Gemini model id |
| `AZURE_OPENAI_ENDPOINT` | if `LLM_PROVIDER=azure` | — | e.g. `https://YOUR_RESOURCE.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | if `LLM_PROVIDER=azure` | — | Azure OpenAI key |
| `AZURE_OPENAI_DEPLOYMENT` | if `LLM_PROVIDER=azure` | — | **Deployment name** for GPT-4o (e.g. `gpt-4o`) |
| `AZURE_OPENAI_API_VERSION` | no | `2024-08-01-preview` | REST API version |
| `DATABASE_URL` | no | `sqlite:///./terrasketch.db` | SQLAlchemy URL |
| `ALLOWED_ORIGINS` | no | `http://localhost:5173,http://localhost:3000` | CSV of CORS origins |
| `RATE_LIMIT_GENERATE` | no | `5/minute` | slowapi rate per IP |
| `APP_ENV` | no | `development` | Free-form env tag |
| `LOG_LEVEL` | no | `INFO` | Python logging level |
| `ADMIN_UI_PASSWORD` | no | — | If set, enables SQLAdmin at `/admin` |
| `ADMIN_UI_USER` | no | `admin` | Login for `/admin` |
| `ADMIN_SESSION_SECRET` | no | `JWT_SECRET` | Cookie signing for admin session |

### Microsoft Foundry + GPT-4o (`2024-11-20`)

1. In [Azure AI Foundry](https://ai.azure.com), open your project and **deploy** a model:
   - Model: **gpt-4o**, version **2024-11-20** (or your chosen snapshot).
   - Note the **deployment name** (this is `AZURE_OPENAI_DEPLOYMENT`, not always the same as the model id).
2. Set **`AZURE_OPENAI_API_KEY`** to the key shown in Foundry / Azure OpenAI for that resource.
3. **`AZURE_OPENAI_ENDPOINT`** — paste whatever Foundry or Portal gives you; the host is what matters:
   - **Primary path:** the app calls **`https://<host>/openai/v1/`** with the standard **`OpenAI`** client (no `api-version` query). Microsoft supports this for both `*.openai.azure.com` and `*.services.ai.azure.com`.
   - **Fallbacks:** Foundry `POST /models/chat/completions?api-version=2024-05-01-preview`, then classic `AzureOpenAI` + `AZURE_OPENAI_API_VERSION` if needed.

```env
LLM_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE.services.ai.azure.com/api/projects/YOUR_PROJECT
# or: https://YOUR_RESOURCE.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-10-21
```

4. Restart `uvicorn`. The app uses the same JSON Terraform output format as other providers; the frontend and ZIP download are unchanged.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create account (email, password; optional `marketing_opt_in`) |
| `POST` | `/api/auth/login` | Sign in → JWT |
| `GET` | `/api/auth/me` | Current user (Bearer token) |
| `POST` | `/api/auth/attach-session` | Link anonymous `session_id` rows to your user (Bearer) |
| `POST` | `/api/auth/logout` | No-op; client discards token |
| `POST` | `/api/generate` | Generate Terraform (optional `Authorization: Bearer` sets `user_id`) |
| `GET` | `/api/generation/{id}` | Fetch a single generation |
| `GET` | `/api/history` | Signed in: Bearer token. Anonymous: `?session_id=...` |
| `POST` | `/api/feedback` | Rate a generation (1-5 stars) |
| `GET` | `/api/health` | Health check |

See `app/db/schemas.py` for full request/response schemas.

## Deploying to Render

1. Push this repo to GitHub.
2. Create a new Web Service on Render pointing at `backend/`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add env vars: `LLM_PROVIDER`, provider keys (`ANTHROPIC_*`, `GEMINI_*`, or `AZURE_OPENAI_*`), `DATABASE_URL`, `ALLOWED_ORIGINS`, and `JWT_SECRET` (long random string).
6. Provision a free PostgreSQL DB on Render, copy its internal URL into `DATABASE_URL`.
7. From the Render shell or a one-off job: `alembic upgrade head`.
