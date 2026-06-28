# NeuroFeed — Hackathon Context

## One-Line Pitch

> *Spaced repetition meets short-form video — built on the student's own syllabus.*

Upload your study material. Get back a TikTok-style learning feed. The passive scroll **is** the studying.

---

## The Problem

- The average student attention span on a static PDF is **under 8 minutes**. The average lecture deck is 40+ pages.
- Students already spend **hours per day** on short-form video feeds (TikTok, Reels, Shorts) — the exact same dopamine loop that pulls them *away* from studying.
- Existing tools (Quizlet, Anki, Notion AI) are **active-work tools**: they require the student to consciously decide to sit down and focus. Most don't.
- The result: course material keeps getting denser; the only medium students passively engage with is entertainment.

**The gap is not effort — it's medium. We close it.**

---

## Our Solution

NeuroFeed turns a student's own uploaded course material into the feed itself. Upload a PDF, slide deck, or lecture recording and within ~2 minutes the same material comes back as:

- **Animated reels** with karaoke subtitles and beat-synced educational visuals
- **Swipe cards** (quick concept checks, like Tinder for facts)
- **Flashcards** (spaced-repetition ready)
- **Quizzes** with adaptive difficulty
- **AI-written summaries**
- **An in-app RAG tutor** that cites the exact page of the original upload

All generated from *one upload*, no pre-built content library needed.

---

## Why It's Novel

| | Traditional study tools | Generic AI tutors | **NeuroFeed** |
|---|---|---|---|
| Content source | Pre-built decks | Public web | **Student's own uploads** |
| Format | Text cards | Chat | **Animated reels + cards + chat** |
| Engagement model | Active recall sessions | Q&A on demand | **Passive feed + active recall** |
| Citations | None | Often hallucinated | **Page-level citations to source** |
| Visual layer | Static | None | **16 animated educational visuals, beat-synced to TTS** |
| Social loop | Solo | Solo | **1v1 challenges, leaderboards, DMs, friends** |

The reel engine is the headline technical contribution: a single user upload is decomposed into topic-bounded narrations (50–130 words each), rendered with 2–6 timed **visual beats** (network packets animating, neural nets propagating, sorting bars swapping, equations resolving). The visual cross-fade is ratio-synced to **actual TTS audio duration** — not fixed timing.

---

## Who It's For

- **Undergraduates** in dense-content disciplines: CS, engineering, pre-med, economics, law
- **Self-learners** working through MOOC PDFs and lecture recordings
- **Exam crammers** who need to turn a 200-page reader into a 20-minute phone review

---

## Feature Inventory

### Ingest Pipeline
- Accepts `pdf`, `docx`, `pptx`, `txt`, `mp3`, `wav`, `m4a`
- Two-stage background pipeline: `parse_job` (text extraction → semantic chunking → embeddings) → `generate_job` (all 6 artifact types in parallel)
- Feed **populates incrementally via SSE** — the first reel appears before the last one is generated
- ~2 minutes from upload to first playable reel

### Reels (headline feature)
- One reel = one topic, 50–130 word narration, auto-split across 1–3 parts for long topics
- **16 animated visual kinds**: `network_packets`, `neural_network`, `tree_traversal`, `sorting_bars`, `linked_list`, `stack_queue`, `equation`, `coordinate_graph`, `flowchart`, `process_diagram`, `molecule`, `waveform`, `supply_demand`, `map_route`, `timeline`, `bar_chart`
- Karaoke-style word-synced subtitles
- Playback speed 0.5×–2×
- TTS URL caching (LRU-80 in-memory, zero re-fetches for repeated views)
- Single-audio coordinator — only one reel plays at a time across the feed
- Resume on scroll re-entry — paused reels pick up exactly where they left off
- In-reel AI tutor sidebar
- "Quick Learning" sheet — jump directly to related flashcard / quiz / summary

### Personalised Feed
- **My Feed**: private, personalised to the user's own uploads
- **Global Feed**: public reels from all users, discoverable by the community
- Explainable ranker: `weak_concept_boost + recency_decay + subject_match + variety_bonus + interest_signal` — every feed item carries a human-readable `reason` field, no black-box ML
- ~20% revision slots for low-mastery concepts
- Hard-hide on heavily-dismissed documents
- Filters: subject / document / artifact type / difficulty / hide-completed
- **Type bar**: tap All / Reels / Cards / Flashcards / Quizzes / Summaries at the top of either feed

### AI Tutor
- RAG chat grounded in the student's own uploaded chunks
- Citations back to exact chunk + page number
- Three answer levels: beginner / intermediate / advanced
- "Explain simpler" shortcut, concrete example presets

### Gamification
- XP per action: quiz correct 15 / reel complete 10 / flashcard 5 / tutor query 4 / upload 25
- Daily cap 200 XP, daily goal 60 XP with visual goal ring
- Streak with 1-day grace period
- Achievements: `first_upload`, `quiz_5`, `quiz_25`, `binge_3`, `curious_10`
- Top HUD always visible with streak chip + goal ring

### Social Layer
- Public profiles: college, subjects, avatar seed, follow/unfollow
- Symmetric friendships (request → accept flow)
- Discover page by subject interest
- Friends list with follow-back status
- Activity feed (follows, challenge events)
- Opt-in leaderboard (global + friends-only)
- Per-surface privacy settings
- In-app challenge notifications

### 1v1 Challenges
- Timed, random, document-scoped, or chapter-scoped
- Server-owned state with self-target guards
- Real-time lobby, question sync, result comparison

### Direct Messages
- Friends-only 1:1 DM system
- Real-time via Supabase Realtime (`postgres_changes`)
- **Reel sharing inline in chat**: shared reels render as an embedded 4:5 player directly in the chat bubble (no redirect to feed)
- Conversation list with last-message preview + unread count badge
- Two-pane layout on desktop; single-column with back nav on mobile

### Engagement on Global Feed
- **Like / unlike** with optimistic UI (instant feedback, revert on error)
- **Inline collapsible comments** — no modal, no popup
  - Collapsed: shows "View all N comments" or "Add a comment…" prompt
  - Expanded: lazy-loaded list with author avatars, timestamps, auto-grow textarea
  - Last 3 shown by default; "View N earlier" toggle
  - Authors can delete their own comments

### Document Lifecycle Controls
- **Publish to Global Feed** — make a private doc public
- **Remove from My Feed** — hide without deleting (still visible in Global)
- **Remove from Global Feed** — unpublish without deleting
- **Delete completely** — removes doc and all artifacts
- Two-step confirmation modal (select action → Apply)
- Hidden docs shown in Dashboard with dashed border + Unhide button

### Mobile
- Capacitor 8 Android shell — same React codebase, USB-tunneled via `adb reverse`
- PWA on desktop and mobile browsers
- Hot-reload on physical device (edits show on phone as fast as in the browser)

---

## Tech Stack

### Frontend (`apps/web`)
| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 + `vite-plugin-pwa` |
| Styling | Tailwind CSS v3 with Material Design 3 semantic tokens |
| Routing | React Router 6 |
| State | Zustand (global) + local `useState`/`useReducer` |
| Animation | Framer Motion |
| Realtime | `@supabase/supabase-js` Realtime channels |
| Mobile | Capacitor 8 (Android) |

### Backend (`apps/api`)
| Layer | Choice |
|---|---|
| Framework | FastAPI (async, Python ≥ 3.10) |
| Background jobs | `asyncio.create_task` (no Celery, no queue worker) |
| Ingest progress | SSE over Upstash Redis event bus (in-process fallback) |
| LLM routing (user-waiting paths) | Groq — `llama-3.3-70b-versatile`, `whisper-large-v3` |
| LLM routing (background batch) | Featherless — `Qwen2.5-72B-Instruct` under `FEATHERLESS_MAX_CONCURRENCY=1` semaphore |
| Embeddings | HuggingFace Inference API — `BAAI/bge-small-en-v1.5` (384-dim) |

### Data / Infrastructure
| Layer | Choice |
|---|---|
| Database | Supabase Postgres + `pgvector` |
| Auth | Supabase Auth (email + magic link) |
| File storage | Supabase Storage |
| Realtime | Supabase Realtime (`postgres_changes` publication) |
| Row-level security | Supabase RLS policies on every table |
| Frontend deploy | Vercel |
| API deploy | Render |

### Data Model Highlights
- **`learning_events`** — append-only log of every interaction (view, quiz_answer, flashcard_review, reel_complete, tutor_query, interested/not_interested). Mastery scores, XP, streaks, and achievements are all *derived* from this table — fully auditable, zero denormalisation.
- **`chunks` + `pgvector`** — semantic search for RAG tutor and feed ranker
- **`artifacts`** — one row per generated item, tagged by type; artifacts from the same doc share `document_id`
- **`reel_likes` / `reel_comments`** — engagement tables with RLS public-read / self-write
- **`conversations` / `messages`** — 1:1 DM tables with canonical pair constraint, message_kind enum (`text` / `reel_share`), and bump-timestamp trigger

---

## Architecture

```
┌──────────────────────────────────────────────┐
│           React PWA + Capacitor              │
│  Feed · Reels · Tutor · Profile · 1v1 · DMs  │
└────────────────┬─────────────────────────────┘
                 │ HTTPS + SSE
┌────────────────▼─────────────────────────────┐
│              FastAPI (async)                 │
│  ingest · feed · tutor · actions · gamify    │
│  social · messages · reels (engagement)      │
└──────┬────────────────────┬──────────────────┘
       │                    │
┌──────▼─────┐      ┌───────▼───────────┐
│ parse_job  │      │    Supabase       │
│ generate   │      │  Postgres +       │
│ _job       │      │  pgvector +       │
│ (asyncio)  │      │  Storage + Auth   │
└──┬──────┬──┘      │  + Realtime       │
   │      │         └───────────────────┘
┌──▼──┐ ┌─▼──────────────────┐
│Groq │ │Featherless (Qwen   │
│(low │ │2.5-72B, semaphore=1│
│lat) │ │for batch artifacts)│
└─────┘ └────────────────────┘
```

**Two-stage pipeline.** `parse_job` → `generate_job`. All six artifact types generate in parallel within `generate_job`; each persists the moment its LLM call returns, so the feed populates over SSE rather than waiting for a full batch.

**Hybrid LLM routing.** User-facing paths (tutor, on-demand) → Groq (sub-second). Background batch → Featherless 70B under concurrency semaphore to fit the plan's unit cap.

**Event-sourced learning state.** Every interaction appends to `learning_events`. Mastery, XP, streaks, and achievements are derived — nothing about user state is denormalised. Drop the events table and rebuild everything.

---

## Key Engineering Decisions

| Decision | Why |
|---|---|
| No Celery / Redis queue for jobs | Keeps the deployment to a single Render service; `asyncio.create_task` is sufficient for the current concurrency |
| `FEATHERLESS_MAX_CONCURRENCY=1` semaphore | 70B model = 4 plan units/call against a 4-unit cap; parallel calls would queue-block each other |
| SSE over WebSocket for ingest progress | SSE is unidirectional and stateless — simpler than WS for a one-shot progress stream |
| TTS URL LRU cache (80 entries) | Zero re-fetches on repeated reel views within a session; avoids rate-limiting on the TTS API |
| Single-audio coordinator | Module-level `ACTIVE_PAUSE` pointer — new reel claims slot and calls previous holder's pause cb, preventing audio overlap without any React state |
| Inline comments (no modal) | Modals break the feed scroll rhythm; collapsible inline section lazy-loads on first expand |
| `learning_events` as source of truth | Every metric is auditable and recomputable; no stale denorm; trivial to add new derived metrics |
| Supabase Realtime for DMs | Zero infra cost, built into the existing Supabase subscription; Postgres triggers guarantee consistency |

---

## Numbers at a Glance

- **~2 min** from upload to first playable reel
- **6 artifact types** from a single upload
- **16 animated visual kinds** in the reel player
- **0 GPU cost** for embeddings (CPU-only via HF Inference API)
- **1 deployment per tier** — Vercel (frontend) + Render (API) + Supabase (data)
- **100% explainable** feed ranking (no black-box ML)

---

## Repo Layout

```
apps/web                   React PWA + Capacitor Android shell
apps/api
  neurofeed/routers/       ingest, feed, tutor, actions, gamify,
                           social, messages, reels, documents, tts
  neurofeed/services/      parse, chunk, embed, generate, rag,
                           rank, mastery, gamify, tts, llm/
  neurofeed/workers/       parse + generate jobs, SSE bus
infra/supabase/            schema.sql + migrations
packages/shared-types/     TypeScript mirror of artifact JSON shapes
samples/                   seed documents for testing
```

---

## Deployment

| Service | URL |
|---|---|
| Frontend (prod) | https://neuro-feed-lyart.vercel.app |
| API (prod) | Render (see `render.yaml`) |
| Database | Supabase (Postgres + pgvector + Auth + Storage + Realtime) |

---

## Current Status

Active development. The full feature set listed above is built and deployed:

- Core learning loop (upload → artifacts → feed → tutor → mastery) — **stable**
- Social layer (profiles, follows, friends, challenges, leaderboard, activity) — **shipped**
- 1:1 DMs with reel sharing — **shipped**
- Global Feed with likes + inline comments — **shipped**
- Android shell (Capacitor) + PWA — **shipped**

**Roadmap:** spaced-repetition scheduler for flashcards (SM-2), classroom mode (instructor upload → student cohort feed), iOS shell, reel remix (re-cut your own version of a reel from the same source chunks).
