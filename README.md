# NeuroFeed

A study-focused social learning platform. Upload PDFs, slides, docs, or lecture audio — get a scrollable feed of reels, swipe cards, flashcards, quizzes, and an AI tutor grounded in your own material. Wrapped in XP, streaks, and daily goals.

> Make learning feel like scrolling TikTok and stick like flashcards.

## Stack

- **Web (`apps/web`):** React + Vite + TypeScript + Tailwind, PWA (`vite-plugin-pwa`). Works on desktop and mobile from one codebase.
- **API (`apps/api`):** FastAPI (Python 3.11+).
- **DB / Auth / Storage:** Supabase free tier (Postgres + `pgvector`).
- **AI providers:** Groq (human-waiting paths) + Featherless Premium (background batch, 4-wide pool).
- **Embeddings:** `fastembed` with `BAAI/bge-small-en-v1.5` (local, CPU).

## Repo layout

```
apps/web        React PWA
apps/api        FastAPI backend
infra/supabase  schema.sql (run on a fresh Supabase project)
packages/shared-types  TS mirror of the artifact JSON schemas
samples         seed documents
```

## Quick start

```bash
# 1. copy env
cp .env.example .env  # fill in keys

# 2. web
cd apps/web
npm install
npm run dev           # http://localhost:5173

# 3. api  (new terminal)
cd apps/api
python -m venv .venv && . .venv/Scripts/activate   # Windows
pip install -e .
uvicorn neurofeed.main:app --reload --port 8000    # http://localhost:8000/api/health
```

## Day 1 demo proof

- `GET http://localhost:8000/api/health` → providers + supabase config flags.
- `POST http://localhost:8000/api/llm/echo` `{ "prompt": "hi", "human_waiting": true }` → JSON round-trip through Groq (or Featherless fallback).

## Status

MVP in progress. See the day-by-day plan in `IMPLEMENTATION_PLAN.md` (not committed).
