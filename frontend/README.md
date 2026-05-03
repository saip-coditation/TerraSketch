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
- `/generate` — Main tool: upload diagram or describe in text.
- `/result/:id` — Generated Terraform with Monaco viewer, copy/download, feedback.
- `/history` — Last 10 generations for the current browser session.
- `/docs` — How-to + tips.
- `/signin` — Email and password (account stored in backend DB).

## Deploying to Vercel

1. Import the repo in Vercel and set the project root to `frontend/`.
2. Build command: `npm run build` (auto-detected).
3. Output directory: `dist`.
4. Add environment variable `VITE_API_URL` pointing at your backend
   (e.g. `https://terrasketch-api.onrender.com`).
5. `vercel.json` already configures the SPA rewrite so deep-links work.
