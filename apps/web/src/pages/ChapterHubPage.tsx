import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { fetchAnalytics, type MasteryRow } from '@/lib/analytics';
import { postEvent } from '@/lib/feed';
import { inferSubject } from '@/lib/subjects';
import { supabase } from '@/lib/supabase';
import type {
  Flashcard,
  QuizItem,
  ReelScript,
  Summary,
} from '../../../../packages/shared-types/artifacts';

interface DocumentRow {
  id: string;
  title: string;
  status: string;
  source_type: string;
  created_at: string;
  error: string | null;
}

interface ArtifactRow<T = unknown> {
  id: string;
  type: string;
  payload: T;
  concept_id: string | null;
  created_at: string;
}

interface GroupedArtifacts {
  summary?: ArtifactRow<Summary>[];
  swipe_card?: ArtifactRow[];
  flashcard?: ArtifactRow<Flashcard>[];
  quiz?: ArtifactRow<QuizItem>[];
  reel_script?: ArtifactRow<ReelScript>[];
}

type SectionId = 'overview' | 'reels' | 'flashcards' | 'quiz' | 'tutor' | 'progress';

export default function ChapterHubPage() {
  const { id: docId } = useParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [artifacts, setArtifacts] = useState<GroupedArtifacts | null>(null);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<SectionId>('overview');

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!docId) return;
      try {
        const [d, a, an] = await Promise.all([
          api<DocumentRow>(`/api/documents/${encodeURIComponent(docId)}`),
          api<GroupedArtifacts>(`/api/documents/${encodeURIComponent(docId)}/artifacts`),
          uid ? fetchAnalytics(uid) : Promise.resolve({ mastery: [] as MasteryRow[], xp_series: [], activity_series: [] }),
        ]);
        setDoc(d);
        setArtifacts(a);
        setMastery(an.mastery);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [docId]);

  // The set of concept_ids touched by this document's artifacts. Used to
  // narrow the global mastery list down to this chapter's concepts.
  const docConceptIds = useMemo(() => {
    const set = new Set<string>();
    const groups = artifacts ?? {};
    for (const list of Object.values(groups) as ArtifactRow[][]) {
      for (const a of list ?? []) {
        if (a.concept_id) set.add(a.concept_id);
      }
    }
    return set;
  }, [artifacts]);

  const docMastery = useMemo(
    () => mastery.filter((m) => docConceptIds.has(m.concept_id)),
    [mastery, docConceptIds],
  );

  const counts = useMemo(() => ({
    reels: artifacts?.reel_script?.length ?? 0,
    flashcards: artifacts?.flashcard?.length ?? 0,
    quizzes: artifacts?.quiz?.length ?? 0,
    cards: artifacts?.swipe_card?.length ?? 0,
    summary: artifacts?.summary?.length ?? 0,
  }), [artifacts]);

  if (err) return <Empty msg={err} />;
  if (!doc || !artifacts) return <Empty msg="Loading…" />;

  const subject = inferSubject(doc.title);

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <header className="px-4 pt-4">
        <Link to="/dashboard" className="text-xs text-white/60 hover:text-white">← Library</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/80">{subject}</span>
          <StatusPill status={doc.status} />
          <span className="text-[10px] text-white/45">· {new Date(doc.created_at).toLocaleDateString()}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{doc.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60 tabular-nums">
          <span>{counts.reels} reels</span>
          <span>· {counts.flashcards} flashcards</span>
          <span>· {counts.quizzes} quizzes</span>
          <span>· {counts.cards} cards</span>
        </div>
        {doc.error && (
          <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-200">
            {doc.error}
          </p>
        )}
      </header>

      <nav className="sticky top-0 z-20 mt-4 border-b border-white/10 bg-ink/85 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 text-xs">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors ${
                active === s.id
                  ? 'bg-accent text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="space-y-6 px-4 pt-5">
        {active === 'overview' && (
          <OverviewSection
            summary={artifacts.summary?.[0] ?? null}
            counts={counts}
            mastery={docMastery}
            onJump={setActive}
          />
        )}
        {active === 'reels' && (
          <ReelsSection rows={artifacts.reel_script ?? []} docId={doc.id} />
        )}
        {active === 'flashcards' && (
          <FlashcardsSection rows={artifacts.flashcard ?? []} userId={userId} />
        )}
        {active === 'quiz' && (
          <QuizSection rows={artifacts.quiz ?? []} userId={userId} />
        )}
        {active === 'tutor' && (
          <TutorSection docId={doc.id} />
        )}
        {active === 'progress' && (
          <ProgressSection mastery={docMastery} />
        )}
      </main>

      <ComingSoonRow />
    </div>
  );
}

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'reels', label: 'Reels' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'tutor', label: 'AI Tutor' },
  { id: 'progress', label: 'Progress' },
];

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'ready' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
    : status === 'error' ? 'bg-rose-500/15 text-rose-200 border-rose-400/30'
    : 'bg-amber-500/15 text-amber-100 border-amber-400/30';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}

// -------- Sections --------

function OverviewSection({
  summary, counts, mastery, onJump,
}: {
  summary: ArtifactRow<Summary> | null;
  counts: { reels: number; flashcards: number; quizzes: number; cards: number };
  mastery: MasteryRow[];
  onJump: (s: SectionId) => void;
}) {
  const avg = mastery.length
    ? mastery.reduce((acc, m) => acc + m.score, 0) / mastery.length
    : 0;
  return (
    <div className="space-y-4">
      {summary ? (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">TL;DR</p>
          <p className="mt-1 text-sm leading-snug">{summary.payload.tldr}</p>
          {summary.payload.bullets?.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/85">
              {summary.payload.bullets.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/55">No summary generated yet.</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <JumpTile glyph="🎬" label="Reels" sub={`${counts.reels} items`} onClick={() => onJump('reels')} />
        <JumpTile glyph="🎴" label="Flashcards" sub={`${counts.flashcards} cards`} onClick={() => onJump('flashcards')} />
        <JumpTile glyph="❓" label="Quiz" sub={`${counts.quizzes} questions`} onClick={() => onJump('quiz')} />
        <JumpTile glyph="💬" label="AI Tutor" sub="Ask anything" onClick={() => onJump('tutor')} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-white/55">Mastery</p>
          <p className="text-xs tabular-nums text-white/75">
            {mastery.length ? `${Math.round(avg * 100)}% avg` : 'No quiz data yet'}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full"
            style={{ width: `${Math.round(avg * 100)}%`, background: avg >= 0.7 ? '#34d399' : avg >= 0.4 ? '#facc15' : '#f87171' }}
          />
        </div>
      </div>
    </div>
  );
}

function JumpTile({ glyph, label, sub, onClick }: { glyph: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-0.5 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-accent/40 hover:bg-white/10"
    >
      <span className="text-xl">{glyph}</span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-white/55">{sub}</span>
    </button>
  );
}

function ReelsSection({ rows, docId }: { rows: ArtifactRow<ReelScript>[]; docId: string }) {
  if (!rows.length) return <EmptyState text="No reels generated yet for this document." />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const script = r.payload;
        const sceneCount = script.scenes?.length ?? 0;
        return (
          <li key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/55">{script.music_mood ?? 'reel'}</p>
            <h3 className="mt-0.5 text-sm font-semibold">{script.title || script.topic}</h3>
            {script.hook && <p className="mt-1 text-xs text-white/70">{script.hook}</p>}
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/55">
              <span>{sceneCount} scenes</span>
              <Link
                to={`/?doc=${encodeURIComponent(docId)}`}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
              >
                Watch in feed
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FlashcardsSection({ rows, userId }: { rows: ArtifactRow<Flashcard>[]; userId: string | null }) {
  if (!rows.length) return <EmptyState text="No flashcards generated yet." />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => <FlashcardRow key={r.id} row={r} userId={userId} />)}
    </ul>
  );
}

function FlashcardRow({ row, userId }: { row: ArtifactRow<Flashcard>; userId: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const card = row.payload;
  return (
    <li>
      <button
        onClick={() => {
          const next = !revealed;
          setRevealed(next);
          if (next && userId) {
            void postEvent(userId, 'flashcard_review', { artifact_id: row.id });
          }
        }}
        className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/8"
      >
        <p className="text-[10px] uppercase tracking-widest text-white/45">Difficulty {card.difficulty}</p>
        <p className="mt-0.5 text-sm font-semibold">{card.question}</p>
        <p className={`mt-2 text-xs ${revealed ? 'text-white/85' : 'text-white/35 blur-[3px]'}`}>
          {revealed ? card.answer : 'Tap to reveal answer'}
        </p>
      </button>
    </li>
  );
}

function QuizSection({ rows, userId }: { rows: ArtifactRow<QuizItem>[]; userId: string | null }) {
  if (!rows.length) return <EmptyState text="No quiz items generated yet." />;
  return (
    <ul className="space-y-3">
      {rows.map((r) => <QuizRow key={r.id} row={r} userId={userId} />)}
    </ul>
  );
}

function QuizRow({ row, userId }: { row: ArtifactRow<QuizItem>; userId: string | null }) {
  const q = row.payload;
  const [chosen, setChosen] = useState<number | null>(null);
  const answered = chosen !== null;
  const correct = chosen === q.answer_index;

  function pick(i: number) {
    if (answered) return;
    setChosen(i);
    if (userId) {
      void postEvent(userId, 'quiz_answer', {
        artifact_id: row.id, chosen: i, correct: i === q.answer_index,
      });
    }
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-sm font-semibold">{q.stem}</p>
      <div className="mt-2 grid gap-1.5">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer_index;
          const isPicked = i === chosen;
          const tone = !answered
            ? 'border-white/10 bg-white/[0.03] hover:bg-white/10'
            : isAnswer
              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-50'
              : isPicked
                ? 'border-rose-400/50 bg-rose-500/20 text-rose-50'
                : 'border-white/10 bg-white/[0.03] text-white/55';
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={answered}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${tone}`}
            >
              <span className="font-semibold tabular-nums">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <p className={`mt-2 text-[11px] ${correct ? 'text-emerald-200' : 'text-rose-200'}`}>
          {correct ? 'Correct.' : 'Not quite.'} {q.explanation}
        </p>
      )}
    </li>
  );
}

function TutorSection({ docId }: { docId: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
      <p className="text-3xl">💬</p>
      <h3 className="mt-2 text-sm font-semibold">Ask the AI Tutor about this chapter</h3>
      <p className="mt-1 text-xs text-white/65">
        Get explanations, examples, and follow-up questions grounded in this document.
      </p>
      <Link
        to={`/tutor?doc=${encodeURIComponent(docId)}`}
        className="mt-4 inline-block rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
      >
        Open AI Tutor
      </Link>
    </div>
  );
}

function ProgressSection({ mastery }: { mastery: MasteryRow[] }) {
  if (!mastery.length) {
    return <EmptyState text="Answer a few quiz items to see mastery here." />;
  }
  return (
    <ul className="space-y-2">
      {mastery
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((m) => (
        <li key={m.concept_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
            <span className="text-xs tabular-nums text-white/65">{Math.round(m.score * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full"
              style={{
                width: `${Math.round(m.score * 100)}%`,
                background: m.score >= 0.7 ? '#34d399' : m.score >= 0.4 ? '#facc15' : '#f87171',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ComingSoonRow() {
  return (
    <div className="mt-8 grid grid-cols-3 gap-2 px-4">
      {[
        { glyph: '📖', label: 'Stories' },
        { glyph: '✎', label: 'Notes' },
        { glyph: '🔖', label: 'Bookmarks' },
      ].map((t) => (
        <div
          key={t.label}
          className="flex flex-col items-center gap-0.5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-center text-white/40"
        >
          <span className="text-xl">{t.glyph}</span>
          <span className="text-xs font-semibold">{t.label}</span>
          <span className="text-[10px]">Coming soon</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/55">
      {text}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="p-8 text-center text-muted">{msg}</div>;
}
