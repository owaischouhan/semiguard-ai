# SemiGuard AI — Deployment Guide

Standalone production deployment guide. Last validated: 2026-06-13.

## Removed Files (Cleanup)

| Path | Action |
|------|--------|
| Platform metadata directory | Deleted — not required at runtime |
| Third-party error reporting module | Deleted |
| External vite-tanstack-config package (npm) | Removed from `package.json` |
| Component tagger (transitive) | Removed via `npm install` cleanup |
| `nitro` (devDependency) | Removed — unused deploy preset |
| `bun.lock` | Deleted — stale lockfile |
| `bunfig.toml` | Deleted — unused Bun install config |

## Configuration

| File | Purpose |
|------|---------|
| `vite.config.ts` | Standard Vite + TanStack Start + React + Tailwind |
| `src/lib/api-config.ts` | Reads `VITE_API_URL` with localhost fallback |
| `src/lib/api.ts` | Uses `API_BASE_URL` from `api-config.ts` |
| `src/vite-env.d.ts` | TypeScript env typing for `VITE_API_URL` |
| `vercel.json` | Static deploy to `dist/client` with SPA rewrites |
| `.env.example` | Documents `VITE_API_URL` |

## Local Validation Results

| Check | Result |
|-------|--------|
| `npm run build` | Pass — client + SSR bundles written to `dist/` |
| `npm run dev` | Pass — http://localhost:5173 |
| `uvicorn app.main:app --reload --port 8000` | Pass — falls back to SQLite if PostgreSQL unavailable |
| `python test_backend.py` | Pass — 8/8 tests OK |
| Backend APIs (`/`, `/status`, `/dashboard-summary`, `/equipment-health`, `/alerts`, `/model-performance`) | All HTTP 200 |
| Frontend routes (`/`, `/fab-map`, `/model-performance`, `/yield`, `/monitoring`) | All HTTP 200 (SSR) |

## Required Environment Variables

### Frontend (Vercel / local)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:8000` | Backend API base URL (no trailing slash) |

Example production value:

```env
VITE_API_URL=https://api.your-domain.com
```

### Backend (Railway, Render, VM, etc.)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | PostgreSQL URL, then SQLite fallback | PostgreSQL connection string for production |
| `PORT` | No | `8000` | Uvicorn listen port |

For local development without PostgreSQL, leave `DATABASE_URL` unset or set `DATABASE_URL=sqlite:///./semiguard.db`.

## Local Development

From the project root (`semi-guard-ai-main/semi-guard-ai-main`):

```bash
# Frontend
cp .env.example .env
npm install
npm run dev

# Backend (separate terminal)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend: http://localhost:5173  
Backend: http://localhost:8000  
API docs: http://localhost:8000/docs

**Important:** Run npm from `semi-guard-ai-main/semi-guard-ai-main`, not the outer wrapper folder.

## Vercel Deployment Steps (Frontend)

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Set **Root Directory** to `semi-guard-ai-main` (inner folder containing `package.json`).
4. Framework Preset: **Other** (uses `vercel.json`).
5. Add environment variable `VITE_API_URL` = your deployed backend URL.
6. Deploy.

`vercel.json` configures:

- Build: `npm run build`
- Output: `dist/client`
- SPA rewrites for client-side routing

## Backend Deployment (Separate Host)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Ensure `ai4i2020.csv` is present at repo root and CORS allows your frontend origin.

## Remaining Notes

1. **SSR on Vercel:** Current `vercel.json` deploys the static client bundle with SPA rewrites. Full SSR requires a Node/serverless adapter (not configured).
2. **CORS:** Backend uses `allow_origins=["*"]` — restrict to your frontend domain in production.
3. **OG images:** Add your own `og:image` in `src/routes/__root.tsx` when ready.
4. **PostgreSQL startup log:** If `DATABASE_URL` is unset, the backend tries PostgreSQL first, logs a connection error, then falls back to SQLite. Set `DATABASE_URL=sqlite:///./semiguard.db` locally to skip that warning.
5. **Package manager:** Use **npm** (`package-lock.json`).
