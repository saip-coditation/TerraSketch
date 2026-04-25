# TerraSketch — Architecture Diagram to Terraform Code Generator
### Complete Product Document v1.0

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Problem Statement](#2-problem-statement)
3. [Target Audience](#3-target-audience)
4. [Core Feature Set](#4-core-feature-set)
5. [Tech Stack Decision](#5-tech-stack-decision)
6. [System Architecture](#6-system-architecture)
7. [The Super Prompt](#7-the-super-prompt-for-ai-engine)
8. [Database Schema](#8-database-schema)
9. [API Endpoints](#9-api-endpoints)
10. [Frontend Pages & Components](#10-frontend-pages--components)
11. [Cloud Platform Coverage](#11-cloud-platform-coverage)
12. [Free Deployment Plan](#12-free-deployment-plan)
13. [Folder Structure](#13-folder-structure)
14. [Future Enhancements (Roadmap)](#14-future-enhancements-roadmap)
15. [Monetization Path (Optional)](#15-monetization-path-optional)

---

## 1. Product Vision

**TerraSketch** is a free, web-based tool that lets developers, DevOps engineers, and cloud architects upload or draw an infrastructure architecture diagram and receive production-ready Terraform (.tf) code for AWS, Azure, or GCP — instantly.

No more manually writing Terraform from scratch. Draw it, upload it, get the code.

---

## 2. Problem Statement

Writing Terraform from an architecture diagram is:
- **Time-consuming** — translating visual components to HCL manually takes hours
- **Error-prone** — missing dependencies, wrong resource names, wrong provider versions
- **Repetitive** — most projects reuse similar patterns (VPC + EC2 + RDS, etc.)
- **Inaccessible to beginners** — developers who understand cloud architecture often don't know Terraform syntax deeply

**TerraSketch solves this** by using AI (Claude via Anthropic API) to parse diagrams and generate clean, annotated, provider-specific Terraform code.

---

## 3. Target Audience

| Segment | Use Case |
|---|---|
| DevOps Engineers | Speed up IaC scaffolding |
| Cloud Architects | Validate designs with real code |
| Developers | Learn Terraform through generated examples |
| Startups | Get infrastructure up fast without dedicated DevOps |
| Students / Learners | Explore cloud resource relationships |

---

## 4. Core Feature Set

### MVP (Phase 1)
- Upload architecture diagram (PNG, JPG, PDF, or draw.io XML)
- Select target cloud provider: AWS / Azure / GCP
- AI analyzes the diagram and extracts components
- Generate full Terraform `.tf` files (main.tf, variables.tf, outputs.tf, providers.tf)
- Copy to clipboard or download as `.zip`
- View generated code with syntax highlighting
- Basic history — last 10 generations saved per session (no login required)

### Phase 2
- User accounts (email + Google OAuth)
- Save and manage past generations
- Edit generated code in-browser (Monaco editor)
- Multi-module Terraform output (organized by resource type)
- Diagram annotation — highlight which part maps to which Terraform resource
- Support for Terraform modules (reusable blocks)

### Phase 3
- Natural language input: "Give me a 3-tier web app on AWS"
- Draw your architecture directly in browser (drag and drop components)
- GitHub integration — push generated Terraform to a repo
- Cost estimator integration (Infracost API — free tier)
- Terraform plan dry-run simulation view

---

## 5. Tech Stack Decision

### Recommended Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | **React + Vite** | Fast, component-friendly, huge ecosystem |
| Styling | **Tailwind CSS** | Utility-first, no extra CSS overhead |
| Code Editor | **Monaco Editor** | Same as VS Code, great for Terraform HCL |
| Backend | **FastAPI (Python)** | Async, fast, perfect for AI API calls |
| AI Engine | **Anthropic Claude API** (claude-sonnet-4) | Best at code + architecture understanding |
| Image Parsing | **Pillow + base64** (Python) | Convert images to base64 for Claude vision |
| Database | **PostgreSQL on Render** | Free tier on Render, persistent |
| ORM | **SQLAlchemy + Alembic** | Industry standard for Python/Postgres |
| Auth (Phase 2) | **Supabase Auth** | Free tier, easy OAuth, pairs with Postgres |
| Frontend Deploy | **Vercel** | Free, instant deploys from GitHub |
| Backend Deploy | **Render** | Free tier with Postgres included |

### Why NOT Django?
FastAPI is lighter, async-native, and perfect for an API-first app that mostly proxies AI calls. Django is better for content-heavy apps. For TerraSketch, FastAPI wins.

### Why Render for DB?
Render gives you a **free PostgreSQL database** with your free account. No need for Supabase DB or any paid tier. This keeps total cost at **$0**.

---

## 6. System Architecture

```
User Browser (React + Vite on Vercel)
        |
        | HTTPS API Calls
        v
FastAPI Backend (on Render)
        |
        |--- Image received (base64 or URL)
        |--- Build prompt with system context
        |--- Call Anthropic Claude API (claude-sonnet-4)
        |--- Parse AI response into structured Terraform files
        |--- Save generation record to PostgreSQL (Render)
        |--- Return structured JSON to frontend
        v
Frontend renders Terraform code with Monaco Editor
User downloads .zip or copies individual files
```

---

## 7. The Super Prompt (For AI Engine)

This is the most critical piece of the product. Below is the **production-grade system prompt** to send to Claude when processing a diagram.

---

### System Prompt (send once per session as `system` role)

```
You are TerraSketch, an expert Infrastructure-as-Code engineer specializing in Terraform for AWS, Azure, and GCP. Your job is to analyze cloud architecture diagrams and produce production-ready Terraform HCL code.

You have deep knowledge of:
- Terraform syntax, modules, providers, data sources, locals, and outputs
- AWS: VPC, EC2, ECS, EKS, RDS, S3, CloudFront, ALB, IAM, Lambda, API Gateway, Route53, SQS, SNS, ElastiCache, Secrets Manager
- Azure: VNet, VM, AKS, App Service, Azure SQL, Storage Account, Application Gateway, Key Vault, Azure Functions, Service Bus, Azure Monitor
- GCP: VPC, GCE, GKE, Cloud Run, Cloud SQL, GCS, Cloud Load Balancing, Cloud Armor, Secret Manager, Pub/Sub, Cloud Functions, Cloud DNS

RULES:
1. Always output valid, formatted Terraform HCL that can be used with `terraform init` and `terraform plan`
2. Always separate code into these files: main.tf, variables.tf, outputs.tf, providers.tf
3. Always use variables for all configurable values (region, instance type, names, CIDRs, etc.) — never hardcode values
4. Always add descriptive comments above each resource block explaining what it does
5. Always include a providers.tf with pinned provider versions (e.g., hashicorp/aws ~> 5.0)
6. Always output sensible, secure defaults (e.g., no 0.0.0.0/0 ingress except for HTTP/HTTPS on load balancers, encrypted storage, private subnets for databases)
7. If you identify a resource in the diagram but are unsure of the specific service, pick the most common equivalent and note your assumption with a comment
8. If a diagram shows connections/arrows between services, model those as the correct Terraform dependencies (e.g., security group references, subnet associations)
9. Never produce placeholder or pseudo-code — all output must be real, working Terraform
10. If the diagram is ambiguous, make reasonable assumptions and document them in a comment block at the top of main.tf

OUTPUT FORMAT: Return a valid JSON object with this exact structure:
{
  "provider": "aws" | "azure" | "gcp",
  "assumptions": ["list of assumptions made"],
  "resources_identified": ["list of cloud resources found in the diagram"],
  "files": {
    "main.tf": "...full file content...",
    "variables.tf": "...full file content...",
    "outputs.tf": "...full file content...",
    "providers.tf": "...full file content..."
  },
  "usage_instructions": "Brief instructions on how to use this Terraform code"
}
```

---

### User Message Template (send per request)

```
Analyze the following cloud architecture diagram and generate Terraform code for {PROVIDER}.

{IF IMAGE}: The diagram has been provided as an image (base64 encoded). Identify all cloud services, connections, and infrastructure components visible.

{IF TEXT DESCRIPTION}: The user described their architecture as follows:
"{USER_DESCRIPTION}"

Target Cloud Provider: {PROVIDER} (aws | azure | gcp)
Environment: {ENVIRONMENT} (dev | staging | production) — use this to set sensible defaults for sizing.

Please generate complete, production-ready Terraform code following all rules in your system instructions.
```

---

### Prompt Enhancement Tips for Better Output

1. **Chain-of-thought trigger**: Add `"Think step by step: first list all resources you see, then map their relationships, then write the Terraform."` to get more accurate output on complex diagrams.

2. **Few-shot priming** (for Phase 2): Include 1-2 example diagram→Terraform pairs in the system prompt for the specific provider the user selects.

3. **Validation pass**: After getting the first response, send a second call: `"Review the Terraform you just generated. Check for: missing provider arguments, circular dependencies, missing required fields, and security issues. Output a corrected version if needed."` — This dramatically improves code quality.

4. **Module detection**: `"If you identify repeated patterns (e.g., multiple identical EC2 instances, multiple subnets), generate a reusable Terraform module instead of repeating resource blocks."`

---

## 8. Database Schema

### Tables (PostgreSQL on Render)

```sql
-- Users (Phase 2, optional for MVP)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    provider VARCHAR(50) DEFAULT 'email', -- 'email', 'google', 'github'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Generation Sessions
CREATE TABLE generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,       -- anonymous session for no-login users
    user_id UUID REFERENCES users(id),      -- null for anonymous
    cloud_provider VARCHAR(20) NOT NULL,    -- 'aws', 'azure', 'gcp'
    environment VARCHAR(20) DEFAULT 'dev',  -- 'dev', 'staging', 'production'
    input_type VARCHAR(20) NOT NULL,        -- 'image', 'text', 'draw'
    input_description TEXT,                 -- text description if used
    resources_identified JSONB,             -- array of detected resources
    assumptions JSONB,                      -- array of AI assumptions
    generated_files JSONB NOT NULL,         -- {main.tf, variables.tf, outputs.tf, providers.tf}
    usage_instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback (for improving AI output quality)
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID REFERENCES generations(id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

> **For MVP**: Only the `generations` table is needed. Users table can be added in Phase 2. Keep it simple.

---

## 9. API Endpoints

### Base URL: `https://terrasketch-api.onrender.com`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/generate` | Main endpoint — upload image or text, get Terraform |
| `GET` | `/api/generation/{id}` | Fetch a specific generation by ID |
| `GET` | `/api/history?session_id=xxx` | Get last 10 generations for a session |
| `POST` | `/api/feedback` | Submit rating/feedback for a generation |
| `GET` | `/api/health` | Health check for Render uptime monitoring |

### POST /api/generate — Request Body

```json
{
  "cloud_provider": "aws",
  "environment": "production",
  "input_type": "image",
  "image_base64": "data:image/png;base64,...",
  "text_description": null,
  "session_id": "sess_abc123"
}
```

### POST /api/generate — Response Body

```json
{
  "generation_id": "uuid-here",
  "cloud_provider": "aws",
  "resources_identified": ["VPC", "EC2", "RDS", "ALB", "S3"],
  "assumptions": ["EC2 instances assumed to be t3.micro for dev", "RDS assumed to be PostgreSQL 15"],
  "files": {
    "main.tf": "...",
    "variables.tf": "...",
    "outputs.tf": "...",
    "providers.tf": "..."
  },
  "usage_instructions": "Run terraform init, then terraform plan to review.",
  "created_at": "2026-04-25T10:00:00Z"
}
```

---

## 10. Frontend Pages & Components

### Pages

| Route | Page | Description |
|---|---|---|
| `/` | **Home / Landing** | Hero, how it works, try it now CTA |
| `/generate` | **Generator** | Main tool page |
| `/result/:id` | **Result View** | View a specific generation with full code |
| `/history` | **History** | Last 10 generations (session-based) |
| `/docs` | **Docs** | How to use, what diagrams work best |

### Key Components

**GeneratorPanel** — The main tool UI
- Cloud provider selector (AWS / Azure / GCP) with logo icons
- Environment selector (Dev / Staging / Production)
- Input tabs: "Upload Diagram" | "Describe in Text"
- Drag-and-drop upload zone (accepts PNG, JPG, PDF, draw.io XML)
- Generate button with loading state

**CodeViewer** — Terraform output display
- Tab bar: main.tf | variables.tf | outputs.tf | providers.tf
- Monaco Editor instance for each file (read-only by default, editable in Phase 2)
- HCL syntax highlighting
- Copy button per file
- Download All as ZIP button

**ResourceMap** — Visual component list
- Shows extracted resources as chips/badges
- Color-coded by service category (compute, storage, network, etc.)

**AssumptionsBox** — AI transparency
- Shows what assumptions the AI made
- Collapsible warning/info box

---

## 11. Cloud Platform Coverage

### AWS Resources (Recognized & Mapped)

| Diagram Label | Terraform Resource |
|---|---|
| VPC | `aws_vpc` |
| Subnet (Public/Private) | `aws_subnet` |
| Internet Gateway | `aws_internet_gateway` |
| NAT Gateway | `aws_nat_gateway` |
| EC2 / Instance | `aws_instance` |
| Auto Scaling Group | `aws_autoscaling_group` |
| Load Balancer (ALB) | `aws_lb`, `aws_lb_listener`, `aws_lb_target_group` |
| RDS / Database | `aws_db_instance` |
| S3 Bucket | `aws_s3_bucket` |
| CloudFront | `aws_cloudfront_distribution` |
| Lambda | `aws_lambda_function` |
| API Gateway | `aws_apigatewayv2_api` |
| ECS / Fargate | `aws_ecs_cluster`, `aws_ecs_service`, `aws_ecs_task_definition` |
| EKS | `aws_eks_cluster`, `aws_eks_node_group` |
| SQS | `aws_sqs_queue` |
| SNS | `aws_sns_topic` |
| ElastiCache | `aws_elasticache_cluster` |
| IAM Role / Policy | `aws_iam_role`, `aws_iam_policy` |
| Security Group | `aws_security_group` |
| Route53 | `aws_route53_zone`, `aws_route53_record` |
| Secrets Manager | `aws_secretsmanager_secret` |

### Azure Resources

| Diagram Label | Terraform Resource |
|---|---|
| Resource Group | `azurerm_resource_group` |
| VNet / Virtual Network | `azurerm_virtual_network` |
| Subnet | `azurerm_subnet` |
| VM / Virtual Machine | `azurerm_linux_virtual_machine` |
| App Service / Web App | `azurerm_app_service` |
| AKS | `azurerm_kubernetes_cluster` |
| Azure SQL | `azurerm_sql_server`, `azurerm_sql_database` |
| Storage Account | `azurerm_storage_account` |
| Application Gateway | `azurerm_application_gateway` |
| Key Vault | `azurerm_key_vault` |
| Azure Functions | `azurerm_function_app` |
| Service Bus | `azurerm_servicebus_namespace` |
| NSG | `azurerm_network_security_group` |
| Load Balancer | `azurerm_lb` |

### GCP Resources

| Diagram Label | Terraform Resource |
|---|---|
| VPC Network | `google_compute_network` |
| Subnet | `google_compute_subnetwork` |
| GCE Instance | `google_compute_instance` |
| GKE Cluster | `google_container_cluster` |
| Cloud Run | `google_cloud_run_service` |
| Cloud SQL | `google_sql_database_instance` |
| GCS Bucket | `google_storage_bucket` |
| Cloud Load Balancer | `google_compute_global_forwarding_rule` |
| Cloud Functions | `google_cloudfunctions_function` |
| Pub/Sub | `google_pubsub_topic` |
| Secret Manager | `google_secret_manager_secret` |
| Cloud DNS | `google_dns_managed_zone` |
| Firewall Rules | `google_compute_firewall` |
| IAM | `google_project_iam_member` |

---

## 12. Free Deployment Plan

### Total Cost: $0/month

| Service | Free Tier Details |
|---|---|
| **Vercel** (Frontend) | Unlimited personal projects, free SSL, auto-deploy from GitHub |
| **Render** (Backend API) | Free web service (spins down after 15min inactivity, wakes on request) |
| **Render PostgreSQL** | Free PostgreSQL DB — 1GB storage, 90-day retention (re-create if needed) |
| **Anthropic API** | Pay-per-use — not free, but Claude Sonnet is ~$0.003/1K input tokens. For demo/MVP, budget ~$5-10/month |

> **Note on Anthropic API Cost**: The one non-free piece is the Claude API. However, costs are very low. A typical Terraform generation call uses ~2,000-3,000 tokens. At Claude Sonnet pricing, that's under $0.01 per generation. For an MVP with low traffic, $5/month of credits will go far. You can add a rate limiter (5 generations/day per IP) to control costs.

### Deployment Steps

**Frontend (Vercel)**
1. Push frontend code to GitHub repo
2. Connect repo to Vercel
3. Set environment variable: `VITE_API_URL=https://your-backend.onrender.com`
4. Auto-deploys on every push to main

**Backend (Render)**
1. Push backend code to GitHub repo
2. Create new Web Service on Render
3. Set environment variables:
   - `ANTHROPIC_API_KEY=sk-ant-...`
   - `DATABASE_URL=postgresql://...` (from Render PostgreSQL)
   - `ALLOWED_ORIGINS=https://your-frontend.vercel.app`
4. Set build command: `pip install -r requirements.txt`
5. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Database (Render)**
1. Create PostgreSQL instance on Render (free tier)
2. Copy the internal database URL
3. Add it as `DATABASE_URL` in your backend service env vars
4. Run migrations on first deploy: `alembic upgrade head`

---

## 13. Folder Structure

```
terrasketch/
├── frontend/                          # React + Vite app
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── GeneratorPanel/
│   │   │   │   ├── GeneratorPanel.jsx
│   │   │   │   ├── UploadZone.jsx
│   │   │   │   └── ProviderSelector.jsx
│   │   │   ├── CodeViewer/
│   │   │   │   ├── CodeViewer.jsx
│   │   │   │   ├── FileTab.jsx
│   │   │   │   └── MonacoPane.jsx
│   │   │   ├── ResourceMap.jsx
│   │   │   ├── AssumptionsBox.jsx
│   │   │   └── shared/
│   │   │       ├── Button.jsx
│   │   │       ├── Badge.jsx
│   │   │       └── LoadingSpinner.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Generate.jsx
│   │   │   ├── Result.jsx
│   │   │   ├── History.jsx
│   │   │   └── Docs.jsx
│   │   ├── services/
│   │   │   └── api.js                 # Axios API client
│   │   ├── utils/
│   │   │   ├── imageToBase64.js
│   │   │   ├── downloadZip.js
│   │   │   └── sessionId.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                           # FastAPI app
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── generate.py        # POST /api/generate
│   │   │   │   ├── history.py         # GET /api/history
│   │   │   │   └── feedback.py        # POST /api/feedback
│   │   │   └── deps.py                # Shared dependencies (DB session)
│   │   ├── core/
│   │   │   ├── config.py              # Settings from env vars
│   │   │   └── prompt_builder.py      # Builds the Claude prompt
│   │   ├── db/
│   │   │   ├── models.py              # SQLAlchemy models
│   │   │   ├── schemas.py             # Pydantic schemas
│   │   │   └── session.py             # DB connection
│   │   ├── services/
│   │   │   ├── claude_service.py      # Anthropic API calls
│   │   │   └── terraform_parser.py    # Parse AI JSON → structured files
│   │   └── main.py                    # FastAPI app entry point
│   ├── alembic/                       # DB migrations
│   ├── requirements.txt
│   └── .env.example
│
└── README.md
```

---

## 14. Future Enhancements (Roadmap)

### High Value, Low Effort
- **Shareable link** — Share a generation via a public URL (read-only)
- **Template library** — Pre-built common patterns: "3-tier web app", "serverless API", "data pipeline"
- **Diff view** — Compare two versions of generated code when you tweak the diagram
- **Validate button** — Run `terraform validate` (via a sandboxed container on Render) and show errors inline

### High Value, Medium Effort
- **Draw mode** — In-browser drag-and-drop diagram builder with cloud service icons (use React Flow or Excalidraw)
- **Multi-cloud output** — One diagram → generate for all 3 clouds simultaneously, with a side-by-side comparison
- **GitHub Push** — Connect your GitHub, push generated Terraform directly to a new repo
- **Terraform Modules** — Auto-detect repeating patterns and output as reusable modules
- **HCL to Diagram** — Reverse feature: paste existing Terraform, get a visual diagram back

### Big Bets (Phase 3+)
- **Cost Estimation** — Integrate Infracost API (free tier) to show estimated monthly cost of the generated infra
- **AI Chat refinement** — After generation, chat with the AI: "Change the EC2 to use spot instances" → live updates the Terraform
- **CI/CD Integration** — Generate GitHub Actions or GitLab CI pipelines alongside the Terraform
- **Pulumi / CDK output** — Not just Terraform, also generate AWS CDK (TypeScript), Pulumi, or Ansible

---

## 15. Monetization Path (Optional)

If you ever want to monetize (keeping a free tier always):

| Tier | Price | Limits |
|---|---|---|
| **Free** | $0 | 10 generations/day, download as files, no history save |
| **Pro** | $9/month | Unlimited generations, saved history, GitHub push, Monaco editing |
| **Team** | $29/month | Everything in Pro + team workspaces, shared library, priority support |

For now — stay free. Build users first.

---

## Quick Start Checklist for Antigravity IDE

- [ ] Create GitHub monorepo: `terrasketch/frontend` and `terrasketch/backend`
- [ ] Set up React + Vite frontend with Tailwind CSS and React Router
- [ ] Set up FastAPI backend with SQLAlchemy, Alembic, and python-dotenv
- [ ] Implement the `/api/generate` endpoint using the Super Prompt above
- [ ] Add Claude API integration with `anthropic` Python SDK
- [ ] Build the GeneratorPanel, CodeViewer, and ResourceMap components
- [ ] Set up Render PostgreSQL, run migrations
- [ ] Deploy backend to Render, frontend to Vercel
- [ ] Add rate limiting (slowapi library for FastAPI) — 5 req/min per IP
- [ ] Add basic analytics (Plausible.io — free and privacy-friendly)

---

*Document created for TerraSketch — Version 1.0 | April 2026*
*Stack: React + Vite | FastAPI | PostgreSQL | Render + Vercel | Anthropic Claude API*
