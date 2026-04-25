# TerraSketch Backend (FastAPI)

The backend API that powers TerraSketch — accepts an architecture
diagram (image) or a text description, calls Anthropic's Claude API,
and returns production-ready Terraform code for AWS / Azure / GCP.

## Stack

- **FastAPI** + **Uvicorn**
- **SQLAlchemy 2.x** + **Alembic** migrations
- **PostgreSQL** in production (Render free tier), **SQLite** locally
- **Anthropic Claude** (vision-capable Sonnet model)
- **slowapi** for IP-based rate limiting

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY

uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the
interactive OpenAPI / Swagger UI.

The first time you run it (with the default SQLite `DATABASE_URL`),
tables are created automatically on startup. For Postgres, use Alembic:

```bash
alembic upgrade head
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Claude API key |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-20250514` | Model to call |
| `DATABASE_URL` | no | `sqlite:///./terrasketch.db` | SQLAlchemy URL |
| `ALLOWED_ORIGINS` | no | `http://localhost:5173,http://localhost:3000` | CSV of CORS origins |
| `RATE_LIMIT_GENERATE` | no | `5/minute` | slowapi rate per IP |
| `APP_ENV` | no | `development` | Free-form env tag |
| `LOG_LEVEL` | no | `INFO` | Python logging level |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/generate` | Generate Terraform from image or text |
| `GET` | `/api/generation/{id}` | Fetch a single generation |
| `GET` | `/api/history?session_id=...` | Last 10 generations for a session |
| `POST` | `/api/feedback` | Rate a generation (1-5 stars) |
| `GET` | `/api/health` | Health check |

See `app/db/schemas.py` for full request/response schemas.

## Deploying to Render

1. Push this repo to GitHub.
2. Create a new Web Service on Render pointing at `backend/`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add env vars: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS`.
6. Provision a free PostgreSQL DB on Render, copy its internal URL into `DATABASE_URL`.
7. From the Render shell or a one-off job: `alembic upgrade head`.

#######################################################
API key details
API Key
AIzaSyDBosBf4oevQO0umAwVORY5y2ExRynfAcM
Name
terraform_key
Project name
projects/462722670057
Project number
462722670057
