import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { fetchAnalytics, type MasteryRow } from '@/lib/analytics';
import { postEvent } from '@/lib/feed';
import { deleteDocument, updateDocument } from '@/lib/dashboard';
import { inferSubject } from '@/lib/subjects';
import { supabase } from '@/lib/supabase';
import { DeleteDocModal, type DeleteAction } from '@/components/library/DeleteDocModal';
import type { Visibility } from '@/lib/social';
import type {
  Flashcard,
  QuizItem,
  ReelScript,
  Summary,
} from '../../../../packages/shared-types/artifacts';

interface DocumentRow {
  id: string;
  user_id: string;
  title: string;
  status: string;
  source_type: string;
  created_at: string;
  error: string | null;
  visibility?: Visibility | null;
  hidden_from_owner?: boolean;
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
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [artifacts, setArtifacts] = useState<GroupedArtifacts | null>(null);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<SectionId>('overview');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isOwner = !!doc && !!userId && doc.user_id === userId;

  async function handleDeleteAction(action: DeleteAction) {
    if (!doc || !userId) return;
    setDeleteBusy(true);
    try {
      if (action === 'delete') {
        await deleteDocument(doc.id, userId);
        setDeleteOpen(false);
        navigate('/dashboard', { replace: true });
      } else if (action === 'hide') {
        await updateDocument(doc.id, userId, { hidden_from_owner: true });
        setDoc({ ...doc, hidden_from_owner: true });
        setDeleteOpen(false);
      } else if (action === 'unpublish') {
        await updateDocument(doc.id, userId, { visibility: 'private' });
        setDoc({ ...doc, visibility: 'private' });
        setDeleteOpen(false);
      } else if (action === 'publish') {
        await updateDocument(doc.id, userId, { visibility: 'public' });
        setDoc({ ...doc, visibility: 'public' });
        setDeleteOpen(false);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onUnhide() {
    if (!doc || !userId) return;
    setDeleteBusy(true);
    try {
      await updateDocument(doc.id, userId, { hidden_from_owner: false });
      setDoc({ ...doc, hidden_from_owner: false });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

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
    <div className="mx-auto max-w-3xl pb-32 pt-20">
      <header className="px-4 pt-2">
        <Link to="/dashboard" className="text-xs text-on-surface-variant hover:text-on-surface">← Library</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-outline-variant bg-surface-container px-2 py-0.5 text-[10px] uppercase tracking-widest text-on-surface">{subject}</span>
          <StatusPill status={doc.status} />
          {doc.hidden_from_owner && (
            <span
              title="Hidden from your My Feed — others can still see it if public"
              className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-100"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden>visibility_off</span>
              Hidden
            </span>
          )}
          <span className="text-[10px] text-outline">· {new Date(doc.created_at).toLocaleDateString()}</span>
          {isOwner && (
            <div className="ml-auto flex items-center gap-1.5">
              {doc.hidden_from_owner && (
                <button
                  type="button"
                  onClick={onUnhide}
                  disabled={deleteBusy}
                  className="rounded-full border border-outline bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                >
                  {deleteBusy ? '…' : 'Unhide'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                disabled={deleteBusy}
                aria-label="Manage document — publish, hide, or delete"
                className="inline-flex items-center gap-1 rounded-full border border-outline bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:border-primary/50 hover:bg-surface-container-high disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden>tune</span>
                Manage…
              </button>
            </div>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{doc.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-on-surface-variant tabular-nums">
          <span>{counts.reels} reels</span>
          <span>· {counts.flashcards} flashcards</span>
          <span>· {counts.quizzes} quizzes</span>
          <span>· {counts.cards} cards</span>
        </div>
        {doc.error && (
          <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-700">
            {doc.error}
          </p>
        )}
      </header>

      <nav className="sticky top-[5rem] z-20 mt-4 border-b border-outline-variant bg-background/90 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 text-xs">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors ${
                active === s.id
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
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

      <DeleteDocModal
        open={deleteOpen}
        title={doc.title}
        visibility={(doc.visibility as Visibility | undefined) ?? 'private'}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDeleteAction}
      />
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
    status === 'ready' ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40'
    : status === 'error' ? 'bg-rose-500/15 text-rose-700 border-rose-500/40'
    : 'bg-amber-500/20 text-amber-800 border-amber-500/40';
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
        <div className="rounded-2xl border border-primary/30 bg-primary-container/30 p-4">
          <p className="text-[10px] uppercase tracking-widest text-primary">TL;DR</p>
          <p className="mt-1 text-sm leading-snug">{summary.payload.tldr}</p>
          {summary.payload.bullets?.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-on-surface">
              {summary.payload.bullets.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No summary generated yet.</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <JumpTile glyph="🎬" label="Reels" sub={`${counts.reels} items`} onClick={() => onJump('reels')} />
        <JumpTile glyph="🎴" label="Flashcards" sub={`${counts.flashcards} cards`} onClick={() => onJump('flashcards')} />
        <JumpTile glyph="❓" label="Quiz" sub={`${counts.quizzes} questions`} onClick={() => onJump('quiz')} />
        <JumpTile glyph="💬" label="AI Tutor" sub="Ask anything" onClick={() => onJump('tutor')} />
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Mastery</p>
          <p className="text-xs tabular-nums text-on-surface">
            {mastery.length ? `${Math.round(avg * 100)}% avg` : 'No quiz data yet'}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container">
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
      className="flex flex-col items-start gap-0.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-left hover:border-primary/40 hover:bg-surface-container-high"
    >
      <span className="text-xl">{glyph}</span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-on-surface-variant">{sub}</span>
    </button>
  );
}

function ReelsSection({ rows, docId }: { rows: ArtifactRow<ReelScript>[]; docId: string }) {
  if (!rows.length) return <EmptyState text="No reels generated yet for this document." />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const script = r.payload;
        const dur = Math.round(script.duration_sec || 0);
        const partTag =
          script.part_index && script.part_total && script.part_total > 1
            ? ` · part ${script.part_index}/${script.part_total}`
            : '';
        return (
          <li key={r.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">
              {script.music_mood ?? 'reel'}{partTag}
            </p>
            <h3 className="mt-0.5 text-sm font-semibold">{script.title || script.topic}</h3>
            {script.subtitle && <p className="mt-1 text-xs text-on-surface-variant">{script.subtitle}</p>}
            <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
              <span>{dur > 0 ? `${dur}s` : 'reel'}</span>
              <Link
                to={`/?doc=${encodeURIComponent(docId)}`}
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary"
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
        className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-left hover:bg-surface-container-high"
      >
        <p className="text-[10px] uppercase tracking-widest text-outline">Difficulty {card.difficulty}</p>
        <p className="mt-0.5 text-sm font-semibold">{card.question}</p>
        <p className={`mt-2 text-xs ${revealed ? 'text-on-surface' : 'text-outline-variant blur-[3px]'}`}>
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
    <li className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <p className="text-sm font-semibold">{q.stem}</p>
      <div className="mt-2 grid gap-1.5">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer_index;
          const isPicked = i === chosen;
          const tone = !answered
            ? 'border-outline-variant bg-surface-container-low hover:bg-surface-container-high'
            : isAnswer
              ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-800'
              : isPicked
                ? 'border-rose-500/60 bg-rose-500/20 text-rose-800'
                : 'border-outline-variant bg-surface-container-low text-on-surface-variant';
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
        <p className={`mt-2 text-[11px] ${correct ? 'text-emerald-700' : 'text-rose-700'}`}>
          {correct ? 'Correct.' : 'Not quite.'} {q.explanation}
        </p>
      )}
    </li>
  );
}

function TutorSection({ docId }: { docId: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 text-center">
      <p className="text-3xl">💬</p>
      <h3 className="mt-2 text-sm font-semibold">Ask the AI Tutor about this chapter</h3>
      <p className="mt-1 text-xs text-on-surface-variant">
        Get explanations, examples, and follow-up questions grounded in this document.
      </p>
      <Link
        to={`/tutor?doc=${encodeURIComponent(docId)}`}
        className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary"
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
        <li key={m.concept_id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
            <span className="text-xs tabular-nums text-on-surface-variant">{Math.round(m.score * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container">
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
          className="flex flex-col items-center gap-0.5 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-3 text-center text-outline"
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
    <div className="rounded-2xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
      {text}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="p-8 text-center text-on-surface-variant">{msg}</div>;
}
