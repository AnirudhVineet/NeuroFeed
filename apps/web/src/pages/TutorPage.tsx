import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { askTutor, type TutorCitation, type TutorLevel, type TutorResponse } from '@/lib/tutor';

interface Turn {
  q: string;
  res?: TutorResponse;
  err?: string;
  pending?: boolean;
}

const LEVELS: { value: TutorLevel; label: string }[] = [
  { value: 'beg', label: 'Beginner' },
  { value: 'int', label: 'Intermediate' },
  { value: 'adv', label: 'Advanced' },
];

export default function TutorPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [level, setLevel] = useState<TutorLevel>('int');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  async function send() {
    if (!userId || !draft.trim()) return;
    const q = draft.trim();
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

  if (!userId) {
    return <div className="p-6 text-muted">Sign in to chat with the tutor.</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.25rem)]">
      <header className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <h1 className="text-lg font-semibold flex-1">Tutor</h1>
        <div className="flex bg-white/5 rounded-lg p-1 text-xs">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              className={`px-2 py-1 rounded ${level === l.value ? 'bg-accent text-white' : 'text-muted'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 && (
          <p className="text-muted">
            Ask anything about your uploaded material. Answers stay grounded in your docs.
          </p>
        )}
        {turns.map((t, i) => (
          <TurnView key={i} turn={t} />
        ))}
        <div ref={endRef} />
      </main>

      <footer className="p-3 border-t border-white/10 flex gap-2">
        <input
          className="flex-1 bg-white/5 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-accent/40"
          placeholder="Ask the tutor…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="px-4 rounded-xl bg-accent disabled:opacity-40"
        >
          Ask
        </button>
      </footer>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div>
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-accent/80 text-white rounded-2xl rounded-br-md px-3 py-2">
          {turn.q}
        </div>
      </div>
      <div className="mt-2 flex">
        <div className="max-w-[90%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-3 py-2">
          {turn.pending && <span className="text-muted">Thinking…</span>}
          {turn.err && <span className="text-red-400">{turn.err}</span>}
          {turn.res && (
            <>
              <p className="whitespace-pre-wrap">{turn.res.answer}</p>
              {turn.res.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {turn.res.citations.map((c, i) => (
                    <CitationChip key={i} c={c} />
                  ))}
                </div>
              )}
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted">
                {turn.res.grounded ? `confidence ${(turn.res.confidence * 100).toFixed(0)}%` : 'not in your material'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CitationChip({ c }: { c: TutorCitation }) {
  const label =
    c.page_or_slide != null ? `p.${c.page_or_slide}` : `chunk ${c.chunk_id}`;
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/15"
      title={`doc ${c.doc_id} • chunk ${c.chunk_id}`}
    >
      {label}
    </span>
  );
}
