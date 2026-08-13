NeuroFeed — Tech, Logic & Architecture

The Core Loop (1 sentence)

▎ Upload any study material → AI turns it into a TikTok-style learning feed, ranked to what you actually need to learn next.

---
1. Ingest Pipeline

User uploads PDF / DOCX / PPTX / audio
          │
          ▼
   Supabase Storage  ←──── stored at uploads/<user_id>/<uuid>
          │
          ▼
   parse_job (asyncio background)
     ├─ Extract text (PyMuPDF / python-docx / python-pptx / Whisper)
     ├─ Semantic chunking (sliding window + topic boundary)
     ├─ Embed chunks → BAAI/bge-small-en-v1.5 (384-dim, HuggingFace)
     └─ Persist chunks + vectors → Postgres (pgvector)
          │
          ▼
   generate_job (asyncio, Featherless 70B)
     ├─ Extract key concepts  (Qwen2.5-72B)
     └─ Fan out 6 artifact generato
          ├─ Summary        (TLDR + bullets)
          ├─ Swipe Cards    (quick-
          ├─ Flashcards     (Q&A pairs, difficulty 1–3)
          ├─ Quiz           (multiple-choice + explanation)
          ├─ Reel Scripts   (narratptions)
          └─ Learning Path  (step-by-step progression)
          │
          ▼
   SSE stream → client sees artifacts appear in real-time

Ingest to playable reel: < 2 minutes.

---
2. Feed Ranking Engine

GET /api/feed  (personal)   or   /a
        │
        ▼
  rank.py — explainable weight scor
    ├─ Mastery score per concept  (EMA over learning events)
    ├─ Time since last seen
    ├─ Content type preference (from interaction history)
    ├─ Difficulty alignment
    └─ Social signals (friends' act
        │
        ▼
  Each feed item carries a `reason` JSON  →  "You haven't seen this in 3 days"
  Every ranking decision is human-a

---
3. LLM Routing (Two-Speed Architect

Path: Human-waiting (tutor, explain-simpler)
Model: Groq — llama-3.3-70b
Why: < 1s latency
────────────────────────────────────────
Path: Background batch (artifact ge
Model: Featherless — Qwen2.5-72B
Why: Cost-efficient, semaphore-capp
────────────────────────────────────────
Path: Transcription
Model: Groq Whisper
Why: Audio uploads
────────────────────────────────────────
Path: Fallback
Model: Featherless if Groq 429s
Why: Resilient routing

---
4. RAG Tutor

User asks question  →  Groq Llama-3.3-70B
        │
        ▼
  Embed question (BAAI/bge-small-en)
        │
        ▼
  match_chunks() RPC  →  pgvector ANN search (IVFFlat, top-k)
  Similarity floor: 0.30  →  below
        │
        ▼
  Inject retrieved chunks as context  →  streamed answer + citations

---
5. Gamification & Mastery

Every interaction (view, quiz answer, flashcard, reel complete)
        │
        ▼
   learning_events table  (event-sourced, append-only)
        │
    ┌───┴───────────────┐
    ▼                   ▼
  mastery.score       XP + streak
  (EMA per concept)   (gamify.py)
    ▼                   ▼
  mastery.score       XP + streak
  (EMA per concept)   (gamify.py)
    │                   │
    ▼                   ▼
  Feed ranking       Achievements,
  (weaker concepts   Leaderboard,
  surface more)      Challenges (1v1 quiz battles)

---
6. Stack Summary

┌────────────┬──────────────────────────────────────────────────────────────────┐
│   Layer    │                               Tech                               │
├────────────┼─────────────────────────────────────┤
│ Frontend   │ React 18 + TypeScript + Vite + Tailwind + Framer Motion          │
├────────────┼─────────────────────────────────────┤
│ Mobile     │ Capacitor 8 (Android WebView) + PWA                              │
├────────────┼─────────────────────────────────────┤
│ Backend    │ FastAPI (Python) on Render                                       │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Database   │ Supabase Postgres +                 │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Auth       │ Supabase Auth (magic link + password, auto-profile trigger)      │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Storage    │ Supabase Storage                    │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Embeddings │ HuggingFace BAAI/bge                │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ LLM        │ Groq (fast) + Feathe                │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Real-time  │ SSE (ingest progress)               │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Social     │ Follows, friends, DMs, reel sharing, 1v1 challenges, leaderboard │
├────────────┼─────────────────────────────────────┤
│ State      │ Zustand (ephemeral XP) + Supabase client (auth/profile)          │
└────────────┴──────────────────────────────────────────────────────────────────┘

---
7. The Pitch Narrative Arc

1. Problem: Students upload lectureurn them into active learning
2. Ingest: Drop any file → AI pipelines it into your personal feed in < 2 min
3. Feed: TikTok-style vertical feeds, 16 animated visuals, quiz cards,flashcards — ranked by what you're weakest at
4. Tutor: Ask anything, get answers grounded in your own material with source citations
5. Social: Challenge friends to qui, compete on the leaderboard
6. Adaptive: The more you engage, the smarter the ranking gets — mastery scores drive what surfaces next

---
The key differentiators worth highlighting in the pitch: explainable feed ranking (every item has a human-readable reason), dual-speed ), and event-sourced learning state(everything is replayable and auditable).

Piece 1 — The Script (Featherless 70B LLM)

The LLM outputs a JSON object — not a video, just structured data:

{
  "narration": "Why doesn't the internet melt? Every packet...",
  "visual_kind": "network_packets",
  "visual_spec": { "nodes": [...], "edges": [...], "packets": [...] },
  "visual_beats": [
    { "at_sec": 0, "visual_kind": "network_packets", "visual_spec": {...} },
    { "at_sec": 8, "visual_kind": "flowchart", "visual_spec": {...} }
  ],
  "duration_sec": 25,
  "music_mood": "curious"
}

Piece 2 — The Audio (Edge TTS)

The narration text is sent to edge-tts (free Microsoft Azure voices) → returns an MP3 blob. The browser plays it via <audio> tag. No video container, just audio bytes.

Piece 3 — The Visuals (React + Framer Motion + SVG)

ReelVisual.tsx is a React component with 16 hand-coded animated SVG renderers — neural networks, sorting bars, flowcharts, network packets, equations, etc. The LLM's visual_spec feeds real data into these (e.g. actual node labels, actual bar values). Framer Motion drives the animations.

---
How it plays back

Audio starts playing (Edge TTS MP3)
        │
        ▼
  useEffect tracks audio.currentTime each frame
        │
        ▼
  visual_beats checked — when currentTime passes `at_sec`:
    → swap to next visual_kind + visual_spec
    → Framer Motion animates the transition
        │
        ▼
  ReelSubtitle.tsx word-syncs captions (karaoke)
  by splitting narration at ~3 words/sec against currentTime

The reel is a React component that behaves like a video by syncing SVG animations to an audio clock. There's no .mp4, no canvas recording, no ffmpeg — it's all client-side DOM.

---
Why this matters for your pitch

    → Framer Motion animates the transition
        │
        ▼
  ReelSubtitle.tsx word-syncs captions (karaoke)
  by splitting narration at ~3 words/sec against currentTime

The reel is a React component that behaves like a video by syncing SVG animations to an audio clock. There's no .mp4, no canvas recording, no ffmpeg — it's all client-side DOM.

---
Why this matters for your pitch

This is actually a strength: generating a real video (ffmpeg, remotion, etc.) would cost seconds of cloud render time per reel and require video storage. This approach is instant to serve (just JSON + a TTS call), zero storage overhead, and the visuals are interactive and data-driven (the packet actually has the right label, the bar chart has real values). The tradeoff is it only runs in the browser, not shareable as a file.