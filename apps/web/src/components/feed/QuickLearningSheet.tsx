import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';
import { postEvent } from '@/lib/feed';
import type {
  Flashcard,
  QuizItem,
  Summary,
} from '../../../../../packages/shared-types/artifacts';

// Server response is artifacts grouped by type. Mirrors
// GET /api/documents/{doc_id}/artifacts.
interface ArtifactRow<T = unknown> {
  id: string;
  type: string;
  payload: T;
  concept_id: string | null;
  created_at: string;
}
interface ArtifactsByType {
  summary?: ArtifactRow<Summary>[];
  flashcard?: ArtifactRow<Flashcard>[];
  quiz?: ArtifactRow<QuizItem>[];
}

type CategoryId = 'flashcards' | 'quiz' | 'summary' | 'tutor' | 'story' | 'notes' | 'bookmark';

export function QuickLearningSheet({
  open,
  onClose,
  topic,
  documentId,
  conceptId,
  userId,
  onOpenTutor,
}: {
  open: boolean;
  onClose: () => void;
  topic: string;
  documentId?: string;
  conceptId?: string | null;
  userId: string | null;
  onOpenTutor: () => void;
}) {
  const [data, setData] = useState<ArtifactsByType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<CategoryId | null>(null);

  // Fetch artifacts when the sheet opens for the first time per document.
  // Keep them between opens for the same document so re-opening is instant.
  useEffect(() => {
    if (!open) return;
    if (!documentId) {
      setError('This reel has no document attached.');
      return;
    }
    if (data) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api<ArtifactsByType>(
          `/api/documents/${encodeURIComponent(documentId)}/artifacts`,
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, documentId, data]);

  // Reset to the menu view each time the sheet closes.
  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  // Split items into "this topic" (matching conceptId) and "this document"
  // (everything else). Stories/Notes have no data yet, so they always sit
  // in the menu as disabled buttons.
  const split = useMemo(() => {
    function partition<T>(rows: ArtifactRow<T>[] | undefined) {
      const all = rows ?? [];
      if (!conceptId) return { hot: all, rest: [] as ArtifactRow<T>[] };
      const hot = all.filter((r) => r.concept_id === conceptId);
      const rest = all.filter((r) => r.concept_id !== conceptId);
      return { hot, rest };
    }
    return {
      flashcards: partition<Flashcard>(data?.flashcard),
      quiz: partition<QuizItem>(data?.quiz),
      summary: data?.summary?.[0] ?? null,
    };
  }, [data, conceptId]);

  const counts = {
    flashcards: split.flashcards.hot.length + split.flashcards.rest.length,
    quiz: split.quiz.hot.length + split.quiz.rest.length,
    summary: split.summary ? 1 : 0,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-modal-root
          data-action
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-outline-variant bg-surface-container-lowest text-on-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Quick learning"
          >
            <div className="mx-auto mb-2 mt-3 h-1 w-10 rounded-full bg-surface-container-high" />
            <SheetHeader
              topic={topic}
              active={active}
              onBack={() => setActive(null)}
              onClose={onClose}
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {active === null && (
                <MenuGrid
                  counts={counts}
                  onPick={(id) => {
                    if (id === 'tutor') { onOpenTutor(); return; }
                    setActive(id);
                  }}
                />
              )}

              {loading && active !== null && (
                <p className="py-10 text-center text-sm text-on-surface-variant">Loading…</p>
              )}
              {error && active !== null && (
                <p className="py-10 text-center text-sm text-rose-300">{error}</p>
              )}

              {!loading && !error && active === 'flashcards' && (
                <FlashcardList hot={split.flashcards.hot} rest={split.flashcards.rest} userId={userId} />
              )}
              {!loading && !error && active === 'quiz' && (
                <QuizList hot={split.quiz.hot} rest={split.quiz.rest} userId={userId} />
              )}
              {!loading && !error && active === 'summary' && (
                <SummaryView row={split.summary} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetHeader({
  topic, active, onBack, onClose,
}: {
  topic: string;
  active: CategoryId | null;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">
          {active ? labelFor(active) : 'Quick Learning'}
        </p>
        <h2 className="truncate text-base font-bold">{topic}</h2>
      </div>
      <div className="flex items-center gap-2">
        {active && (
          <button
            onClick={onBack}
            className="rounded-full border border-outline px-3 py-1 text-xs text-on-surface hover:bg-surface-container"
          >
            ← Back
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-full bg-accent px-4 py-1 text-xs font-semibold text-on-primary"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function labelFor(id: CategoryId): string {
  switch (id) {
    case 'flashcards': return 'Flashcards';
    case 'quiz': return 'Practice quiz';
    case 'summary': return 'Summary';
    case 'tutor': return 'AI tutor';
    case 'story': return 'Story mode';
    case 'notes': return 'Notes';
    case 'bookmark': return 'Bookmark';
  }
}

const TILES: { id: CategoryId; glyph: string; label: string; sub: string; comingSoon?: boolean }[] = [
  { id: 'flashcards', glyph: '🎴', label: 'Flashcards', sub: 'Practice key facts' },
  { id: 'quiz', glyph: '❓', label: 'Quiz', sub: 'Check what you know' },
  { id: 'summary', glyph: '📄', label: 'Summary', sub: 'TL;DR for this document' },
  { id: 'tutor', glyph: '💬', label: 'AI Tutor', sub: 'Ask about this reel' },
  { id: 'story', glyph: '📖', label: 'Story Mode', sub: 'Coming soon', comingSoon: true },
  { id: 'notes', glyph: '✎', label: 'Generate Notes', sub: 'Coming soon', comingSoon: true },
];

function MenuGrid({
  counts,
  onPick,
}: {
  counts: { flashcards: number; quiz: number; summary: number };
  onPick: (id: CategoryId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 pb-4">
      {TILES.map((t) => {
        const count =
          t.id === 'flashcards' ? counts.flashcards
          : t.id === 'quiz' ? counts.quiz
          : t.id === 'summary' ? counts.summary
          : null;
        const disabled = t.comingSoon || (count !== null && count === 0);
        return (
          <button
            key={t.id}
            onClick={() => !disabled && onPick(t.id)}
            disabled={disabled}
            className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors ${
              disabled
                ? 'border-outline-variant bg-surface-container-lowest text-outline'
                : 'border-outline-variant bg-surface-container-low hover:border-accent/40 hover:bg-surface-container'
            }`}
          >
            <span className="text-2xl">{t.glyph}</span>
            <span className="text-sm font-semibold">{t.label}</span>
            <span className="text-[11px] text-on-surface-variant">
              {t.comingSoon
                ? 'Coming soon'
                : count !== null && count === 0
                  ? 'Not generated yet'
                  : count !== null
                    ? `${count} item${count === 1 ? '' : 's'}`
                    : t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// -------- Per-category views --------

function FlashcardList({
  hot, rest, userId,
}: {
  hot: ArtifactRow<Flashcard>[];
  rest: ArtifactRow<Flashcard>[];
  userId: string | null;
}) {
  return (
    <div className="space-y-4 pb-4">
      {hot.length > 0 && (
        <Group title="For this topic">
          {hot.map((r) => <FlashcardRow key={r.id} row={r} userId={userId} />)}
        </Group>
      )}
      {rest.length > 0 && (
        <Group title={hot.length > 0 ? 'More from this document' : 'From this document'}>
          {rest.map((r) => <FlashcardRow key={r.id} row={r} userId={userId} />)}
        </Group>
      )}
      {hot.length === 0 && rest.length === 0 && (
        <p className="py-8 text-center text-sm text-on-surface-variant">No flashcards yet for this document.</p>
      )}
    </div>
  );
}

function FlashcardRow({ row, userId }: { row: ArtifactRow<Flashcard>; userId: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const card = row.payload;
  return (
    <button
      onClick={() => {
        const next = !revealed;
        setRevealed(next);
        if (next && userId) {
          void postEvent(userId, 'flashcard_review', { artifact_id: row.id });
        }
      }}
      className="w-full rounded-xl border border-outline-variant bg-surface-container-low p-3 text-left hover:bg-surface-container"
    >
      <p className="text-[10px] uppercase tracking-widest text-outline">
        Difficulty {card.difficulty}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{card.question}</p>
      <p className={`mt-2 text-xs ${revealed ? 'text-on-surface' : 'text-outline blur-[3px]'}`}>
        {revealed ? card.answer : 'Tap to reveal answer'}
      </p>
    </button>
  );
}

function QuizList({
  hot, rest, userId,
}: {
  hot: ArtifactRow<QuizItem>[];
  rest: ArtifactRow<QuizItem>[];
  userId: string | null;
}) {
  return (
    <div className="space-y-4 pb-4">
      {hot.length > 0 && (
        <Group title="For this topic">
          {hot.map((r) => <QuizRow key={r.id} row={r} userId={userId} />)}
        </Group>
      )}
      {rest.length > 0 && (
        <Group title={hot.length > 0 ? 'More from this document' : 'From this document'}>
          {rest.map((r) => <QuizRow key={r.id} row={r} userId={userId} />)}
        </Group>
      )}
      {hot.length === 0 && rest.length === 0 && (
        <p className="py-8 text-center text-sm text-on-surface-variant">No quiz items yet for this document.</p>
      )}
    </div>
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
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
      <p className="text-sm font-semibold">{q.stem}</p>
      <div className="mt-2 grid gap-1.5">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer_index;
          const isPicked = i === chosen;
          const tone = !answered
            ? 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container'
            : isAnswer
              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-50'
              : isPicked
                ? 'border-rose-400/50 bg-rose-500/20 text-rose-50'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant';
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
    </div>
  );
}

function SummaryView({ row }: { row: ArtifactRow<Summary> | null }) {
  if (!row) {
    return <p className="py-8 text-center text-sm text-on-surface-variant">No summary yet.</p>;
  }
  const s = row.payload;
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-xl border border-accent/30 bg-accent/10 p-3">
        <p className="text-[10px] uppercase tracking-widest text-accent">TL;DR</p>
        <p className="mt-1 text-sm leading-snug">{s.tldr}</p>
      </div>
      {s.bullets?.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-on-surface-variant">Key points</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface">
            {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-on-surface-variant">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
