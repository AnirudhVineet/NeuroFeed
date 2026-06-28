import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { askTutor, type TutorCitation, type TutorLevel, type TutorResponse } from '@/lib/tutor';
import { useGamify } from '@/state/gamify';

interface Turn {
  q: string;
  res?: TutorResponse;
  err?: string;
  pending?: boolean;
}

const LEVELS: { value: TutorLevel; label: string; sub: string }[] = [
  { value: 'beg', label: 'Beginner', sub: 'plain English' },
  { value: 'int', label: 'Intermediate', sub: 'balanced' },
  { value: 'adv', label: 'Advanced', sub: 'technical' },
];

const SUGGESTIONS: { glyph: string; label: string; prompt: string }[] = [
  { glyph: '📖', label: 'Explain this chapter', prompt: 'Explain the most recent chapter I uploaded in simple terms.' },
  { glyph: '🧠', label: 'Quiz me', prompt: 'Generate 5 quiz questions on my latest material and grade my answers.' },
  { glyph: '✍', label: 'Summarize this document', prompt: 'Summarize the document I most recently uploaded into a TL;DR and 5 bullets.' },
  { glyph: '🎴', label: 'Make flashcards', prompt: 'Create 8 flashcards covering the key concepts from my most recent document.' },
];

export default function TutorPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [level, setLevel] = useState<TutorLevel>('int');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const gamify = useGamify((s) => s.state);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  async function send(text?: string) {
    const q = (text ?? draft).trim();
    if (!userId || !q) return;
    setDraft('');
    setTurns((t) => [...t, { q, pending: true }]);
    try {
      const res = await askTutor(userId, q, level);
      setTurns((t) =>
        t.map((turn, i) => (i === t.length - 1 ? { q, res } : turn)),
      );
    } catch (e) {
      setTurns((t) =>
        t.map((turn, i) =>
          i === t.length - 1 ? { q, err: e instanceof Error ? e.message : String(e) } : turn,
        ),
      );
    }
  }

  const docsUsed = turns.flatMap((t) => t.res?.citations.map((c) => c.doc_id) ?? []);
  const uniqueDocs = Array.from(new Set(docsUsed)).length;

  if (!userId) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 pb-32 pt-32 text-center">
        <p className="text-balance text-lg text-on-surface-variant">Sign in to chat with the tutor.</p>
        <Link
          to="/auth"
          className="mt-5 inline-flex rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2.5 text-sm font-semibold text-on-primary shadow-glow"
        >
          Sign in →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col px-3 pb-28 pt-[5.25rem]">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">AI Tutor</h1>
          <p className="text-xs text-on-surface-variant">Grounded in your uploaded material.</p>
        </div>
        <div className="flex items-center gap-2">
          {gamify && (
            <span className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-[11px] text-on-surface-variant">
              <span className="font-bold text-on-surface">L{Math.min(99, 1 + Math.floor(gamify.xp_total / 250))}</span>
              <span className="ml-1 text-on-surface-variant">{gamify.xp_total.toLocaleString()} XP</span>
            </span>
          )}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="glass flex rounded-full p-1 text-xs">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              className={`rounded-full px-3 py-1 font-medium transition-all ${
                level === l.value
                  ? 'bg-gradient-to-br from-primary via-secondary to-accent text-on-primary shadow-glow'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title={l.sub}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span>
            {uniqueDocs > 0
              ? `Using ${uniqueDocs} document${uniqueDocs === 1 ? '' : 's'} as context`
              : 'Will cite from your library'}
          </span>
        </div>
      </div>

      <main className="scrollbar-thin flex-1 overflow-y-auto rounded-3xl border border-outline-variant bg-surface-container p-4 shadow-soft">
        {turns.length === 0 ? (
          <EmptyTutor onPick={(p) => void send(p)} />
        ) : (
          <div className="space-y-5">
            {turns.map((t, i) => (
              <TurnView key={i} turn={t} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="mt-3">
        <div className="glass-dark flex items-end gap-2 rounded-2xl p-2 shadow-soft">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything about your material…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="scrollbar-hidden max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-on-surface outline-none placeholder:text-outline"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-secondary to-accent text-on-primary shadow-glow transition-all enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-outline">
          Press Enter to send · Shift+Enter for newline
        </p>
      </footer>
    </div>
  );
}

function EmptyTutor({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-8 text-center">
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/30 via-secondary/20 to-accent/30 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-outline-variant bg-surface-container text-on-surface shadow-soft">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-12.1 6.86L4 20l1.2-4.4A8 8 0 1 1 21 12Z" />
          </svg>
        </div>
      </div>
      <h2 className="text-balance text-lg font-bold text-on-surface">Ask me anything you've uploaded.</h2>
      <p className="mt-1.5 max-w-md text-balance text-sm text-on-surface-variant">
        I'll cite the exact pages and chunks I'm pulling from, so every answer is grounded.
      </p>
      <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.prompt)}
            className="group flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-container-high hover:shadow-soft"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/25 text-lg">
              {s.glyph}
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-on-surface">{s.label}</span>
            <svg
              className="h-4 w-4 shrink-0 text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-on-surface"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-primary via-secondary to-accent px-3.5 py-2 text-sm text-on-primary shadow-soft">
          {turn.q}
        </div>
      </div>
      <div className="flex">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-[11px] font-bold text-on-primary">
          AI
        </div>
        <div className="ml-2 max-w-[88%] rounded-2xl rounded-bl-md border border-outline-variant bg-surface-container px-3.5 py-2.5 text-sm text-on-surface shadow-soft">
          {turn.pending && <ThinkingDots />}
          {turn.err && <span className="text-rose-300">{turn.err}</span>}
          {turn.res && (
            <>
              <p className="whitespace-pre-wrap leading-relaxed">{turn.res.answer}</p>
              {turn.res.citations.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {turn.res.citations.map((c, i) => (
                    <CitationChip key={i} c={c} />
                  ))}
                </div>
              )}
              <div className="mt-2 text-[10px] uppercase tracking-widest text-outline">
                {turn.res.grounded
                  ? `confidence ${(turn.res.confidence * 100).toFixed(0)}%`
                  : 'not in your material'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-on-surface-variant">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-surface-variant" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-surface-variant" style={{ animationDelay: '160ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-surface-variant" style={{ animationDelay: '320ms' }} />
    </span>
  );
}

function CitationChip({ c }: { c: TutorCitation }) {
  const label =
    c.page_or_slide != null ? `p.${c.page_or_slide}` : `chunk ${c.chunk_id}`;
  return (
    <span
      className="rounded-full border border-outline bg-surface-container-high px-2 py-0.5 text-[10px] text-on-surface-variant"
      title={`doc ${c.doc_id} • chunk ${c.chunk_id}`}
    >
      {label}
    </span>
  );
}
