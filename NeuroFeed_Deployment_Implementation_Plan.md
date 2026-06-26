# NeuroFeed Deployment Implementation Plan

## Architecture

-   **Frontend:** `apps/web` (React + Vite) → **Vercel**
-   **Backend:** `apps/api` (FastAPI) → **Render**
-   **Database/Auth/Storage:** **Supabase**
-   **Source Control:** GitHub

------------------------------------------------------------------------

# Phase 1 -- Prepare the Repository

## Clean local artifacts

Delete:

-   `apps/web/node_modules`
-   `apps/api/.venv`
-   `apps/api/*.egg-info`

Check git status:

``` bash
git status
```

Commit and push:

``` bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

------------------------------------------------------------------------

# Phase 2 -- Configure Supabase

1.  Create a Supabase project.
2.  Open **SQL Editor**.
3.  Run:

```{=html}
<!-- -->
```
    infra/supabase/schema.sql

4.  Run every SQL file inside:

```{=html}
<!-- -->
```
    infra/supabase/migrations/

------------------------------------------------------------------------

# Phase 3 -- Deploy Backend (Render)

Create a **Web Service**.

### Settings

-   Runtime: Python
-   Root Directory:

```{=html}
<!-- -->
```
    apps/api

Build Command:

``` bash
pip install -e .
```

Start Command:

``` bash
uvicorn neurofeed.main:app --host 0.0.0.0 --port $PORT
```

### Environment Variables

``` text
GROQ_API_KEY
FEATHERLESS_API_KEY

GROQ_CHAT_MODEL
GROQ_REASONING_MODEL
GROQ_STT_MODEL
FEATHERLESS_MODEL
FEATHERLESS_MAX_CONCURRENCY

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE

UPSTASH_REDIS_URL

API_HOST=0.0.0.0
API_PORT=8000

CORS_ORIGINS=http://localhost:5173
```

Verify:

    https://YOUR_RENDER_URL/api/health

------------------------------------------------------------------------

# Phase 4 -- Deploy Frontend (Vercel)

Import GitHub repository.

Settings:

-   Framework: Vite
-   Root Directory:

```{=html}
<!-- -->
```
    apps/web

Install Command:

``` bash
npm install
```

Build Command:

``` bash
npm run build
```

Output Directory:

    dist

### Environment Variables

``` text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_BASE_URL=https://YOUR_RENDER_URL
```

Deploy.

------------------------------------------------------------------------

# Phase 5 -- Update CORS

After Vercel deployment, update Render:

``` text
CORS_ORIGINS=http://localhost:5173,https://YOUR_VERCEL_URL.vercel.app
```

Redeploy Render.

------------------------------------------------------------------------

# Phase 6 -- Final Testing

Backend:

    https://YOUR_RENDER_URL/api/health

Frontend:

    https://YOUR_VERCEL_URL.vercel.app

Verify:

-   Sign up
-   Login
-   Upload document
-   Feed generation
-   AI Tutor
-   Quiz
-   Social features
-   XP & Streaks

------------------------------------------------------------------------

# Local Development Commands

## Backend

``` bash
cd apps/api
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
uvicorn neurofeed.main:app --reload --port 8000
```

## Frontend

``` bash
cd apps/web
npm install
npm run dev
```

------------------------------------------------------------------------

# Production Checklist

-   [ ] Supabase configured
-   [ ] Schema imported
-   [ ] Migrations executed
-   [ ] Backend deployed
-   [ ] Backend health endpoint works
-   [ ] Frontend deployed
-   [ ] Environment variables configured
-   [ ] CORS updated
-   [ ] Sign-up/login tested
-   [ ] Upload tested
-   [ ] Feed tested
-   [ ] AI Tutor tested
-   [ ] Quiz tested
-   [ ] Mobile/PWA tested

------------------------------------------------------------------------

# Troubleshooting

## Failed to fetch

-   Backend not running
-   Wrong `VITE_API_BASE_URL`
-   Missing CORS origin
-   Backend crashed

## Supabase false in health

-   Wrong URL
-   Wrong keys
-   `.env` not loaded

## Render build fails

Check:

``` bash
pip install -e .
```

## Vercel build fails

Run locally:

``` bash
npm run build
```

Fix TypeScript/build errors before redeploying.

------------------------------------------------------------------------

# Recommended Stack

  Component        Service
  ---------------- ----------
  Frontend         Vercel
  Backend          Render
  Database         Supabase
  Auth             Supabase
  Storage          Supabase
  Source Control   GitHub

Deployment order:

1.  Push to GitHub
2.  Configure Supabase
3.  Deploy Render backend
4.  Deploy Vercel frontend
5.  Update CORS
6.  Final testing
