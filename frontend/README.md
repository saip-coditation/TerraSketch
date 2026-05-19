# TerraSketch Frontend (React + Vite)

Modern, dark-themed UI for TerraSketch. Built with React 18, Vite,
Tailwind CSS, React Router, and the Monaco editor (with a custom HCL
syntax highlighter).

## Quick start

```bash
cd frontend
npm install

cp .env.example .env
# Optional: VITE_API_URL (empty = Vite proxy to local API).

npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

## Pages

- `/` — Landing page with hero and feature highlights.
- `/generate` — Main tool: upload diagram or describe in text; architecture preset; correction note; diff vs last run. Accepts `prefill` state (provider, environment, inputType, text) from Templates or Re-generate.
- `/result/:id` — v1 result: Monaco viewer, match-score ring, complexity badge, security score, cost estimate, cost optimizer, Mermaid export, diff summary, ZIP download, feedback, Re-generate button.
- `/v2/result` — v2 result: resource plan summary, HITL edit buttons, collapsible "Why this code?" `AgentTrace` panel.
- `/templates` — 6 pre-built architecture templates; filter by provider; "Use this template" pre-fills Generate form.
- `/history` — Last 10 generations for the current browser session.
- `/docs` — How-to + tips.
- `/signin` — Email and password (account stored in backend DB).

## Key components

| Component | Path | Purpose |
|---|---|---|
| `AgentTrace` | `src/components/insights/AgentTrace.jsx` | Collapsible per-node reasoning panel for v2 results |
| `InsightsDeck` | `src/components/insights/InsightsDeck.jsx` | Improvement advice + security warnings for v1 results |
| `MatchScoreRing` | `src/components/insights/MatchScoreRing.jsx` | SVG ring showing diagram-to-Terraform match % |
| `ComplexityBadge` | `src/components/insights/ComplexityBadge.jsx` | Simple/Moderate/Complex/Enterprise badge with 10 signal pills |
| `SecurityScorePanel` | `src/components/insights/SecurityScorePanel.jsx` | 16 HCL regex security checks, score ring, expandable findings |
| `CostEstimator` | `src/components/insights/CostEstimator.jsx` | Monthly cost estimate with two-stage resource lookup |
| `CostOptimizer` | `src/components/insights/CostOptimizer.jsx` | 14 Terraform-aware cost optimization recommendations |
| `MermaidExport` | `src/components/insights/MermaidExport.jsx` | Auto-generated Mermaid architecture diagram with copy/open |
| `GenerationProgress` | `src/components/GenerationProgress.jsx` | Animated 5-stage progress bar during API call |
| `CodeViewer` | `src/components/CodeViewer/` | Monaco editor with HCL syntax for generated files |
| `ThemeContext` | `src/context/ThemeContext.jsx` | Dark/light mode toggle persisted to localStorage |

## API helpers (`src/services/api.js`)

| Function | Endpoint | Purpose |
|---|---|---|
| `generateTerraform(payload)` | `POST /api/generate` | v1 generation |
| `generateTerraformV2(payload)` | `POST /api/v2/generate` | v2 agentic generation |
| `editGenerationIR(id, ir)` | `POST /api/v2/generation/{id}/ir/edit` | HITL: patch IR, re-run Plan |
| `editGenerationPlan(id, plan)` | `POST /api/v2/generation/{id}/plan/edit` | HITL: patch Plan, re-run Synth |
| `editGenerationFiles(id, files)` | `POST /api/v2/generation/{id}/files/edit` | HITL: patch files, re-validate |
| `getHistory(sessionId)` | `GET /api/history` | Fetch generation history for a session |
| `submitFeedback(id, rating, comment)` | `POST /api/feedback` | Submit 1–5 star rating |

## Deploying to Vercel

1. Import the repo in Vercel and set the project root to `frontend/`.
2. Build command: `npm run build` (auto-detected).
3. Output directory: `dist`.
4. Add environment variable `VITE_API_URL` pointing at your backend
   (e.g. `https://terrasketch-api.onrender.com`).
5. `vercel.json` already configures the SPA rewrite so deep-links work.
