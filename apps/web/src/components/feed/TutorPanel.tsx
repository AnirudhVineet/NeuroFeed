import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { askTutor, type TutorCitation } from '@/lib/tutor';

export interface TutorContext {
  topic: string;
  sceneType?: string;
  sceneSubtitle?: string;
  sceneNarration?: string;
  sceneIndex: number;
  totalScenes: number;
  timestampSec: number;
  documentId?: string;
  conceptId?: string | null;
}

interface QA {
  q: string;
  a?: string;
  citations?: TutorCitation[];
  err?: string;
  pending?: boolean;
}

const PRESETS = [
  'Explain this more simply.',
  'Give me a concrete example.',
  'Why is this important?',
  'Generate a quick quiz on this scene.',
  'How does this connect to what came before?',
  'What\'s a common misconception here?',
];

export function TutorPanel({
  open,
  ctx,
  onClose,
}: {
  open: boolean;
  ctx: TutorContext;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<QA[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  async function ask(question: string) {
    if (!question.trim()) return;
    const entry: QA = { q: question, pending: true };
    setHistory((h) => [...h, entry]);
    setQ('');
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) throw new Error('Sign in to ask the tutor.');
      const ctxLine = buildContextLine(ctx);
      const full = `${question.trim()}\n\nContext: ${ctxLine}`;
      const res = await askTutor(uid, full, 'int', ctx.documentId);
      setHistory((h) =>
        h.map((it, i) =>
          i === h.length - 1
            ? { q: question, a: res.answer, citations: res.citations, pending: false }
            : it,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHistory((h) =>
        h.map((it, i) => (i === h.length - 1 ? { q: question, err: msg, pending: false } : it)),
      );
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            data-modal-root
            className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            data-modal-root
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-[60] flex h-dvh w-full max-w-md flex-col border-l border-white/10 bg-ink shadow-2xl sm:w-[420px]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <h2 className="text-lg font-bold leading-tight">AI Tutor</h2>
                <p className="mt-1 text-xs text-white/65">
                  {ctx.topic}
                  {ctx.sceneSubtitle ? ` · ${ctx.sceneSubtitle}` : ''}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-widest text-white/45">
                  Scene {ctx.sceneIndex + 1}/{ctx.totalScenes} · {formatTime(ctx.timestampSec)}
                </p>
              </div>
              <button
                data-action
                onClick={onClose}
                className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20"
                aria-label="Close tutor"
              >
                ✕
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {history.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-white/70">
                    Ask anything about this scene, or tap a quick prompt:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        data-action
                        onClick={() => ask(p)}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {history.map((it, i) => (
                    <li key={i} className="flex flex-col gap-1.5">
                      <div className="self-end rounded-2xl rounded-br-sm bg-accent/85 px-3 py-2 text-sm">
                        {it.q}
                      </div>
                      <div className="self-start max-w-[90%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed">
                        {it.pending && <span className="text-white/55">Thinking…</span>}
                        {it.err && <span className="text-red-400">{it.err}</span>}
                        {it.a && <p className="whitespace-pre-wrap">{it.a}</p>}
                        {it.citations && it.citations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {it.citations.map((c, j) => (
                              <span
                                key={j}
                                className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/70"
                              >
                                {c.page_or_slide != null
                                  ? `p.${c.page_or_slide}`
                                  : `chunk ${c.chunk_id}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(q);
              }}
              className="border-t border-white/10 p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void ask(q);
                    }
                  }}
                  placeholder="Ask about this scene…"
                  rows={1}
                  className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  data-action
                  type="submit"
                  disabled={!q.trim()}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  Ask
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function buildContextLine(ctx: TutorContext): string {
  const parts = [
    `topic="${ctx.topic}"`,
    `scene=${ctx.sceneIndex + 1}/${ctx.totalScenes}`,
    `at=${formatTime(ctx.timestampSec)}`,
  ];
  if (ctx.sceneType) parts.push(`type=${ctx.sceneType}`);
  if (ctx.sceneSubtitle) parts.push(`subtitle="${ctx.sceneSubtitle}"`);
  if (ctx.sceneNarration) {
    const trimmed = ctx.sceneNarration.slice(0, 280);
    parts.push(`narration="${trimmed}"`);
  }
  return parts.join(' · ');
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
