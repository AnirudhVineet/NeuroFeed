# NeuroFeed

Upload your study material — PDFs, slides, docs, lecture audio — and get back a TikTok-style learning feed: animated reels, swipe cards, flashcards, quizzes, and an AI tutor that cites your own pages. Wrapped in XP, streaks, a friends layer, 1v1 challenges, and a leaderboard.

> Make learning feel like scrolling TikTok and stick like flashcards.

## The problem

- The average student attention span on a static PDF is **under 8 minutes**, but the average lecture slide deck is 40+ pages.
- Students already spend **hours per day** on short-form video feeds (TikTok, Reels, Shorts) — the same dopamine loop that pulls them *away* from studying.
- Existing study tools (Quizlet, Anki, Notion AI) are **active-work tools** — they require the student to sit down, decide to study, and stay focused.
- The result is a widening gap: course material gets longer and denser; the only medium students passively engage with is entertainment.

## Our solution

**NeuroFeed turns the student's own course material into the feed itself.** Upload a PDF, a slide deck, or a lecture recording — and within minutes, the same material comes back as a vertical, swipeable, animated learning feed with karaoke subtitles, an AI tutor that cites the source page, and a gamified XP loop. The passive scroll *is* the studying.

**One sentence:** *Spaced repetition meets short-form video — built on the student's own syllabus.*

## Why it's novel

| | Traditional study tools | Generic AI tutors | **NeuroFeed** |
|---|---|---|---|
| Content source | Pre-built decks | Public web | **Student's own uploads** |
| Format | Text cards | Chat | **Animated reels + cards + chat** |
| Engagement model | Active recall sessions | Q&A on demand | **Passive feed + active recall** |
| Citations | None | Often hallucinated | **Page-level citations to source** |
| Visual layer | Static | None | **16 animated educational visuals, beat-synced to TTS** |
| Social loop | Solo | Solo | **1v1 challenges, leaderboards, friends** |

The reels engine is the headline technical contribution: a **single user upload** is decomposed into topic-bounded narrations of 50–130 words, each rendered as 2–6 timed **visual beats** (network packets animating, neural nets propagating, sorting bars swapping, equations resolving), with the visual cross-fade ratio-synced to **actual TTS duration** rather than fixed timing. Long topics auto-split across 1–3 contiguous reels and are kept adjacent in the feed by a custom ranker.

## Who it's for

- **Undergraduates** in dense-content disciplines: CS, engineering, pre-med, economics, law.
- **Self-learners** working through MOOC PDFs and lecture recordings without a structured course.
- **Exam crammers** who need to convert a 200-page reader into something they can review on a phone in line for coffee.

## Impact at a glance

- **Time-to-first-review:** under ~2 minutes from upload to first playable reel (artifacts stream in incrementally via SSE — the feed populates as the generator finishes).
- **Zero GPU cost:** embeddings run locally on CPU via `BAAI/bge-small-en-v1.5` (384-dim, `fastembed`).
- **Offline-tolerant mobile:** Capacitor 8 Android shell + PWA on desktop/mobile browsers.
- **Explainable ranking:** every feed item carries a `reason` field (weak-concept boost / recency / subject match / variety / interest signal) — no black-box ML.
- **Six artifact types** from one upload: `summary`, `swipe_card`, `flashcard`, `quiz`, `reel_script`, plus an in-app RAG tutor on every chunk.

## System architecture (high level)

```
                    ┌──────────────────────────────────────────┐
                    │              React PWA + Capacitor       │
                    │   Feed · Reels · Tutor · Profile · 1v1   │
                    └────────────────┬─────────────────────────┘
                                     │ HTTPS + SSE
                    ┌────────────────▼─────────────────────────┐
                    │             FastAPI (async)              │
                    │   routers: ingest · feed · tutor ·       │
                    │            actions · gamify · social     │
                    └────────┬───────────────────┬─────────────┘
                             │                   │
              ┌──────────────▼──┐         ┌──────▼──────────┐
              │  parse_job →    │         │   Supabase      │
              │  generate_job   │         │  Postgres +     │
              │  (background    │         │  pgvector +     │
              │   asyncio tasks)│         │  Storage + Auth │
              └──┬───────────┬──┘         └─────────────────┘
                 │           │
       ┌─────────▼──┐   ┌────▼─────────────┐
       │  Groq      │   │  Featherless     │
       │  (latency) │   │  (batch, 70B)    │
       │  Llama-3.3 │   │  semaphore=1     │
       │  Whisper   │   │                  │
       └────────────┘   └──────────────────┘
                 │
       ┌─────────▼─────────────┐
       │ Local CPU embeddings  │
       │  BAAI/bge-small-en    │
       │  (fastembed, 384-dim) │
       └───────────────────────┘
```

**Two-stage pipeline.** `parse_job` extracts text → semantic chunks → embeddings into `chunks.embedding`. `generate_job` runs all six artifact types in parallel, persisting each one the moment its LLM call returns, so the feed populates incrementally over SSE. Background jobs are plain `asyncio.create_task` — no Celery, no Redis queue for the work itself (Redis is only the SSE event bus).

**Hybrid LLM routing.** User-waiting paths (tutor, on-demand summaries) hit **Groq** for sub-second latency. Background batch artifact generation hits **Featherless** on the 70B model under a `FEATHERLESS_MAX_CONCURRENCY=1` semaphore — necessary because each 70B call consumes 4 plan units against a 4-unit cap.

**Event-sourced learning state.** Every interaction (view, quiz answer, flashcard review, reel completion, tutor query, interested/not-interested) appends to `learning_events`. Per-concept mastery, XP, streaks, and achievements are all *derived* — drop the events table and you can rebuild every score. This makes the entire learning model auditable and the ranker fully explainable.

## Roadmap

- **Now:** core loop stable (upload → artifacts → feed → tutor → mastery). Social, multiplayer, and Android shell shipped recently.
- **Next:** spaced-repetition scheduler for flashcards (SM-2), reel comments + remix, classroom mode (instructor uploads → student cohort feed), iOS shell.
- **Research:** detecting and flagging non-educational uploaded content; a "story format" reel mode that connects multiple topics into a narrative arc.

---

## What ships today

**Ingest → artifacts**
- Upload `pdf` / `docx` / `pptx` / `txt` or `mp3` / `wav` / `m4a` lecture audio
- Two-stage pipeline (`parse_job` → `generate_job`) chunks, embeds with local `BAAI/bge-small-en-v1.5` (CPU, no GPU bill), and emits artifacts incrementally as they finish
- Five artifact types: `summary`, `swipe_card`, `flashcard`, `quiz`, `reel_script`

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
