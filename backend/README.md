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
5. Add env vars: `LLM_PROVIDER`, provider keys (`ANTHROPIC_*`, `GEMINI_*`, or `AZURE_OPENAI_*`), `DATABASE_URL`, `ALLOWED_ORIGINS`.
6. Provision a free PostgreSQL DB on Render, copy its internal URL into `DATABASE_URL`.
7. From the Render shell or a one-off job: `alembic upgrade head`.