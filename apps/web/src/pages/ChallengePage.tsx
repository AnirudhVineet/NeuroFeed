import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { api } from '@/lib/api';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import {
  challenge as createChallenge,
  fetchProfileByUsername,
  finishChallenge,
  type ProfileMeta,
} from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { QuizItem } from '../../../../packages/shared-types/artifacts';

type Mode = '1v1' | 'timed' | 'random' | 'document' | 'chapter';

// Quiz Battle. Loads a real opponent profile from the API, real quiz items
// from the selected document, simulates opponent answers against their public
// accuracy (currently approximated from XP — replaceable when a real rating
// lands), and persists the final score via /api/challenges/{id}/finish so it
// shows up in the opponent's match history too.

export default function ChallengePage() {
  const [params] = useSearchParams();
  const opponentUsername = params.get('user') ?? '';
  const initialMode = (params.get('mode') as Mode | null) ?? '1v1';
  const initialDoc = params.get('doc');

  const [opponent, setOpponent] = useState<ProfileMeta | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [docId, setDocId] = useState<string | null>(initialDoc);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<{ id: string; payload: QuizItem }[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState({ you: 0, them: 0 });
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(15);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Look up the opponent + session + your docs
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const [d, op] = await Promise.all([
        fetchDocuments(uid),
        opponentUsername ? fetchProfileByUsername(opponentUsername) : Promise.resolve(null),
      ]);
      const withQuizzes = d.items.filter((doc) => doc.counts.quiz > 0);
      setDocs(withQuizzes);
      setOpponent(op);
      if (!docId && withQuizzes.length) setDocId(withQuizzes[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentUsername]);

  // Once we have a doc + opponent, create the challenge and load quiz items.
  useEffect(() => {
    if (!docId || !opponent || !userId) return;
    void (async () => {
      setErr(null);
      try {
        const [g, c] = await Promise.all([
          api<{ quiz?: { id: string; payload: QuizItem }[] }>(`/api/documents/${encodeURIComponent(docId)}/artifacts`),
          createChallenge({ to: opponent.username, mode, doc_id: docId }),
        ]);
        const five = pickRandom(g.quiz ?? [], 5);
        setItems(five);
        setIdx(0);
        setScore({ you: 0, them: 0 });
        setPicked(null);
        setDone(false);
        setSeconds(mode === 'timed' ? 10 : 15);
        setChallengeId(c.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, mode, opponent?.user_id, userId]);

  // Timer (timed mode only)
  useEffect(() => {
    if (mode !== 'timed' || done || picked !== null) return;
    const t = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [mode, done, picked]);

  useEffect(() => {
    if (mode === 'timed' && picked === null && seconds === 0 && items.length) {
      setScore((s) => ({ ...s, them: s.them + 1 }));
      setTimeout(advance, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const current = items[idx];
  const opAccuracy = useMemo(() => {
    if (!opponent) return 0.55;
    // Higher-XP opponents are smarter; capped at 0.92 so even top players miss.
    return Math.min(0.92, 0.45 + opponent.xp / 12000);
  }, [opponent]);

  function pick(i: number) {
    if (picked !== null || !current) return;
    const correct = i === current.payload.answer_index;
    const opCorrect = Math.random() < opAccuracy;
    setPicked(i);
    setScore((s) => ({
      you: s.you + (correct ? 1 : 0),
      them: s.them + (opCorrect ? 1 : 0),
    }));
    setTimeout(advance, 1100);
  }

  async function advance() {
    if (idx + 1 >= items.length) {
      setDone(true);
      if (challengeId) {
        try { await finishChallenge(challengeId, score.you, score.them); }
        catch (e) { console.error(e); }
      }
      return;
    }
    setIdx((i) => i + 1);
    setPicked(null);
    setSeconds(mode === 'timed' ? 10 : 15);
  }

  if (!opponentUsername) return <Empty msg="No opponent specified. Open a profile and tap 'Challenge'." />;
  if (!userId) return <Empty msg="Sign in to start a challenge." />;
  if (opponent === null && opponentUsername) {
    return <Empty msg={`Loading @${opponentUsername}…`} />;
  }
  if (!docs.length) return <Empty msg="Upload a document with a quiz first." />;
  if (!opponent) return <Empty msg={`No user @${opponentUsername}.`} />;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-24">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-primary/15 via-secondary/10 to-accent/15 p-4 shadow-soft">
        <p className="text-[10px] uppercase tracking-widest text-white/55">Quiz Battle</p>
        <div className="mt-2 flex items-center gap-4">
          <PlayerCard label="You" score={score.you} seed={userId} you />
          <span className="text-2xl font-bold text-white/65">vs</span>
          <PlayerCard label={`@${opponent.username}`} score={score.them} seed={opponent.avatar_seed || opponent.user_id} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select label="Mode" value={mode} onChange={(v) => setMode(v as Mode)}>
            <option value="1v1">1v1</option>
            <option value="timed">Timed</option>
            <option value="random">Random topic</option>
            <option value="document">Document specific</option>
            <option value="chapter">Chapter specific</option>
          </Select>
          <Select label="Document" value={docId ?? ''} onChange={setDocId}>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </Select>
          {mode === 'timed' && !done && (
            <span className="ml-auto rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-bold tabular-nums text-amber-100">
              {seconds}s
            </span>
          )}
        </div>
      </header>

      {err && <p className="mt-3 text-xs text-rose-300">{err}</p>}

      {!done && current && (
        <article className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-soft">
          <p className="text-[10px] uppercase tracking-widest text-white/55">
            Question {idx + 1} / {items.length}
          </p>
          <h2 className="mt-2 text-base font-semibold text-white">{current.payload.stem}</h2>
          <div className="mt-3 grid gap-2">
            {current.payload.options.map((opt, i) => {
              const isAnswer = i === current.payload.answer_index;
              const isPicked = i === picked;
              const tone = picked === null
                ? 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                : isAnswer
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-50'
                  : isPicked
                    ? 'border-rose-400/50 bg-rose-500/15 text-rose-50'
                    : 'border-white/10 bg-white/[0.03] text-white/55';
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={picked !== null}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${tone}`}
                >
                  <span className="font-bold tabular-nums">{String.fromCharCode(65 + i)}.</span>
                  <span className="flex-1">{opt}</span>
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <p className="mt-2 text-xs text-white/65">{current.payload.explanation}</p>
          )}
        </article>
      )}

      {done && (
        <article className="mt-5 rounded-3xl border border-white/10 bg-gradient-to-br from-card/60 via-card/40 to-card/30 p-6 text-center shadow-soft">
          <p className="text-[10px] uppercase tracking-widest text-white/55">Match over</p>
          <h2 className="mt-2 text-2xl font-bold text-white">
            {score.you > score.them ? 'You won!' : score.you < score.them ? `@${opponent.username} won` : 'Draw'}
          </h2>
          <p className="mt-2 text-sm text-white/75">Final: {score.you} – {score.them}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => {
                setIdx(0);
                setScore({ you: 0, them: 0 });
                setPicked(null);
                setDone(false);
                setItems(pickRandom(items, items.length));
              }}
              className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              Rematch
            </button>
            <Link
              to={`/u/${opponent.username}`}
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs text-white hover:bg-white/10"
            >
              View @{opponent.username}
            </Link>
            <Link
              to="/friends"
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs text-white hover:bg-white/10"
            >
              See all challenges
            </Link>
          </div>
        </article>
      )}

      <p className="mt-4 text-center text-[10px] text-white/45">
        Result persisted to Supabase. Opponent's match is currently simulated locally — wire to
        realtime once both players are online to play live.
      </p>
    </div>
  );
}

function PlayerCard({ label, score, seed, you }: { label: string; score: number; seed: string; you?: boolean }) {
  return (
    <div className={`flex flex-1 items-center gap-3 rounded-2xl border p-3 ${you ? 'border-primary/40 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}>
      <Avatar seed={seed} size={40} online={you} linkTo={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{label}</p>
        <p className="text-[10px] text-white/55">{you ? 'You' : 'Opponent'}</p>
      </div>
      <span className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-2.5 py-1 text-sm font-bold tabular-nums text-white shadow-glow">
        {score}
      </span>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/55">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white outline-none focus:border-primary"
      >
        {children}
      </select>
    </label>
  );
}

function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

function Empty({ msg }: { msg: string }) {
  return <div className="px-8 pb-32 pt-32 text-center text-sm text-white/55">{msg}</div>;
}
