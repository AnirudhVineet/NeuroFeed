# NeuroFeed

Upload your study material — PDFs, slides, docs, lecture audio — and get back a TikTok-style learning feed: animated reels, swipe cards, flashcards, quizzes, learning paths, and an AI tutor that cites your own pages. Wrapped in XP, streaks, a friends layer, 1v1 challenges, and a leaderboard.

> Make learning feel like scrolling TikTok and stick like flashcards.

## What ships today

**Ingest → artifacts**
- Upload `pdf` / `docx` / `pptx` / `txt` or `mp3` / `wav` / `m4a` lecture audio
- Two-stage pipeline (`parse_job` → `generate_job`) chunks, embeds with local `BAAI/bge-small-en-v1.5` (CPU, no GPU bill), and emits artifacts incrementally as they finish
- Six artifact types: `summary`, `swipe_card`, `flashcard`, `quiz`, `reel_script`, `learning_path_step`

**Reels (the headline feature)**
- One reel = one topic, with a continuous 50–130 word narration
- Long topics auto-split across 1–3 reels via `part_index` / `part_total` and stay contiguous in the feed
- Each reel renders 2–6 timed **visual beats** keyed to phrases in the narration; the player cross-fades between them, ratio-synced to actual TTS duration
- 16 educational visual kinds: `network_packets`, `neural_network`, `tree_traversal`, `sorting_bars`, `linked_list`, `stack_queue`, `equation`, `coordinate_graph`, `flowchart`, `process_diagram`, `molecule`, `waveform`, `supply_demand`, `map_route`, `timeline`, `bar_chart`
- Karaoke-style word-synced subtitles, playback speed (0.5×–2×), fullscreen, in-reel AI tutor, "Quick Learning" sheet for jumping to related flashcards/quiz/summary

**Personalised feed**
- Explainable ranker (`services/rank.py`): weak-concept boost + recency decay + subject match + variety bonus + interest signal
- ~20% revision slots stride-injected for low-mastery concepts
- Hard-hide on heavily-dismissed documents; multi-part reels grouped + ordered by `part_index`
- Filters by subject / document / type / difficulty; hide-completed toggle

**AI tutor**
- RAG chat with citations back to the exact chunk + page
- Three answer levels (`beg` / `int` / `adv`), explain-simpler shortcut, presets like "give me a concrete example"

**Gamification**
- XP per action (quiz right 15 / reel done 10 / flashcard 5 / tutor 4 / upload 25), daily cap 200, daily goal 60
- Streak with 1-day grace
- Achievements: `first_upload`, `quiz_5`, `quiz_25`, `binge_3`, `curious_10`
- Top HUD with goal ring + streak chip

**Social + multiplayer**
- Profiles with college, subjects, avatar, public/private toggle
- Follows + symmetric friendships (request → accept)
- 1v1 challenges: timed, random, document-scoped, or chapter-scoped; server-owned with self-target guards
- Discover by subject, friends list, activity feed, opt-in leaderboard, per-surface privacy settings
- In-app notifications (challenge sent / accepted / completed)

**Mobile**
- Capacitor 8 Android shell — same React code, USB-tunneled to the dev server via `adb reverse` (no WiFi needed)
- PWA on desktop and mobile browsers

## Stack

- **Web** (`apps/web`) — React 18, Vite, TypeScript, Tailwind, Framer Motion, Zustand, React Router 6, `vite-plugin-pwa`, Capacitor 8 (Android)
- **API** (`apps/api`) — FastAPI on Python ≥3.10, async throughout; in-process background jobs via `asyncio.create_task`
- **DB / Auth / Storage** — Supabase (Postgres + `pgvector` + Storage + Auth + RLS)
- **LLM providers** — Groq for human-waiting paths (`llama-3.3-70b-versatile`, `gpt-oss-120b`, `whisper-large-v3`); Featherless for background batch (`Meta-Llama-3.1-70B-Instruct`, semaphore-capped to fit the plan's concurrency budget)
- **Embeddings** — `fastembed` with `BAAI/bge-small-en-v1.5` (local CPU, 384-dim)
- **Queue / events** — Upstash Redis (event bus for ingest progress SSE)

## Repo layout

```
apps/web                   React PWA + Capacitor Android shell
apps/api                   FastAPI backend
  neurofeed/routers/       health, llm, ingest, documents, feed, actions,
                           tutor, tts, gamify, analytics, social
  neurofeed/services/      parse, chunk, embed, generate, rag, rank,
                           mastery, gamify, tts, llm/ (providers)
  neurofeed/workers/       jobs (parse + generate), bus
infra/supabase/            schema.sql + migrations (interest events,
                           social, multiplayer)
packages/shared-types/     TypeScript mirror of artifact JSON shapes
samples/                   seed documents
```

## Quick start

```bash
# 0. one-time: create a Supabase project, run infra/supabase/schema.sql,
#    then each file in infra/supabase/migrations/ in date order.

# 1. env
cp .env.example .env
# fill in: GROQ_API_KEY, FEATHERLESS_API_KEY, SUPABASE_URL,
#          SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, UPSTASH_REDIS_URL
#          (plus the VITE_* mirror of Supabase + the API base URL)

# 2. web  (terminal 1)
cd apps/web
npm install
npm run dev                       # http://localhost:5173

# 3. api  (terminal 2)
cd apps/api
python -m venv .venv
. .venv/Scripts/activate          # Windows  (or `source .venv/bin/activate`)
pip install -e .
uvicorn neurofeed.main:app --reload --port 8000
# health check: http://localhost:8000/api/health
```

## Mobile (Android)

```bash
# from apps/web
npm run build
npx cap sync android
npx cap open android               # opens Android Studio

# on a USB-connected device, after install:
adb reverse tcp:5173 tcp:5173      # phone → laptop Vite
adb reverse tcp:8000 tcp:8000      # phone → laptop API
# re-run both after every USB reconnect
```

`capacitor.config.ts` points the WebView at `http://localhost:5173`, so the app loads the live Vite dev server through the USB tunnel — edits hot-reload on the phone exactly like in a browser.

## Architecture notes

**Ingest pipeline.** Upload hits `POST /api/ingest`; a `parse_job` extracts text from the source, semantically chunks it, embeds each chunk into `chunks.embedding`, and then chains into `generate_job`. The generator runs all artifact types in parallel — but Featherless calls go through a `FEATHERLESS_MAX_CONCURRENCY=1` semaphore (the 70B model eats 4 plan units per call against a 4-unit cap). Each artifact persists the moment its LLM call returns, so the feed populates incrementally. Status streams to the client via SSE on `GET /api/ingest/{doc_id}/status`.

**Ranking.** `services/rank.py` is intentionally not ML — `score = weak_concept_boost + recency_decay + subject_match + variety_bonus + interest_signal`, all explainable in a per-item `reason` field stamped into `feed_items`. After base scoring, multi-part reels collapse into one representative carrying its siblings in part-order, then expand inline so a 3-part reel is never split across non-adjacent slots. The slot loop allows a small overshoot of `limit` rather than truncate a part mid-sequence.

**Mastery & events.** Every meaningful interaction is appended to `learning_events` (view, quiz_answer, flashcard_review, reel_complete, tutor_query, interested, not_interested, …). `services/mastery.py` derives per-concept EMA scores from those events; `services/gamify.py` derives XP/streak/achievements. Nothing about user state is denormalised — drop the events table and you can rebuild everything.

**Social.** Server-owned challenge state with self-target guards; all writes go through Supabase RLS scoped to the requesting user. The social router degrades gracefully if the migration tables aren't applied yet (returns empty lists instead of 500), so the core learning loop works on a fresh Supabase even before you run the social migrations.

## Environment

See `.env.example` for the full set. The non-obvious ones:

- `FEATHERLESS_MAX_CONCURRENCY` — must stay at `1` on the Premium plan (70B costs 4 plan units per call against a 4-unit cap)
- `UPSTASH_REDIS_URL` — used as the event bus for ingest-progress SSE; falls back to in-process broadcast if unset
- `VITE_API_BASE_URL` — the web app's view of the API; defaults to `http://localhost:8000`

## Status

Active development. Core learning loop (upload → artifacts → feed → tutor → mastery) is stable. Social, multiplayer, and the Android shell are recent additions and still moving fast.
