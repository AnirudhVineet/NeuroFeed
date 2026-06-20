import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CardActions } from '@/components/feed/CardActions';
import {
  countActive,
  emptyFilters,
  FilterSheet,
  type DocOption,
  type FeedFilters,
} from '@/components/feed/FilterSheet';
import { FlashcardCard } from '@/components/feed/FlashcardCard';
import { QuizCard } from '@/components/feed/QuizCard';
import { ReelCard } from '@/components/feed/ReelCard';
import { SwipeCard } from '@/components/feed/SwipeCard';
import type { TutorContext } from '@/components/feed/TutorPanel';
import {
  explainSimpler,
  fetchFeed,
  postEvent,
  type FeedItem,
} from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import { inferSubject } from '@/lib/subjects';
import { useGamify } from '@/state/gamify';
import type {
  Flashcard,
  QuizItem,
  ReelScript,
  SwipeCard as SwipeCardData,
} from '../../../../packages/shared-types/artifacts';

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { title: string; body: string } | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>(() => emptyFilters());
  const [filterOpen, setFilterOpen] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => loadCompletedIds());
  const refreshGamify = useGamify((s) => s.refreshAfter);
  const feedRef = useRef<HTMLDivElement | null>(null);

  // Documents represented in the feed, with an inferred subject. Used by both
  // the filter sheet and the active-filter logic.
  const docOptions = useMemo<DocOption[]>(() => {
    const seen = new Map<string, DocOption>();
    for (const it of items) {
      if (!it.document_id || seen.has(it.document_id)) continue;
      const title = it.document_title ?? 'Untitled';
      seen.set(it.document_id, {
        id: it.document_id,
        title,
        subject: inferSubject(title),
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  const visibleItems = useMemo(
    () => applyFilters(items, filters, completedIds),
    [items, filters, completedIds],
  );
  const activeCount = countActive(filters);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try {
        const res = await fetchFeed(uid);
        setItems(res.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // Reel-to-reel keyboard / global nav. The CSS scroll-snap handles the actual
  // motion; this just nudges by one page height for ↑ / ↓ / j / k / PgUp / PgDn.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = feedRef.current;
      if (!el) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t && t.closest('[data-modal-root]')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function markCompleted(id: string) {
    setCompletedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveCompletedIds(next);
      return next;
    });
  }

  if (!userId)
    return (
      <EmptyState
        glyph={<LockGlyph />}
        message="Sign in to see your feed."
        sub="Your personalized reels, quizzes, and flashcards live here."
        cta={
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-105 active:scale-95"
          >
            Sign in →
          </Link>
        }
      />
    );
  if (error)
    return (
      <EmptyState
        glyph={<WarnGlyph />}
        message="Something went wrong."
        sub={error}
      />
    );
  if (!items.length)
    return (
      <EmptyState
        glyph={<SparkGlyph />}
        message="Your feed is empty."
        sub="Upload a document and we'll turn it into reels, flashcards, and quizzes."
        cta={
          <Link
            to="/upload"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-105 active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
            </svg>
            Upload now
          </Link>
        }
      />
    );

  return (
    <>
      <FilterPill
        active={activeCount}
        onClick={() => setFilterOpen(true)}
      />
      <FilterSheet
        open={filterOpen}
        filters={filters}
        docs={docOptions}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        onClear={() => setFilters(emptyFilters())}
      />
      <div ref={feedRef} className="feed">
        {visibleItems.length === 0 ? (
          <EmptyState
            glyph={<FilterGlyph />}
            message="No items match these filters."
            sub="Try loosening a filter or clear them all to see your full feed."
            cta={
              <button
                onClick={() => setFilters(emptyFilters())}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-105 active:scale-95"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          visibleItems.map((it) => {
            const tutorContext = tutorContextFor(it);
            return (
              <section key={`${it.id}-${it.created_at}`} className="relative">
                <CardErrorBoundary type={it.type}>
                  <CardBody
                    item={it}
                    override={overrides[it.id] ?? null}
                    userId={userId}
                    onComplete={() => markCompleted(it.id)}
                    onExplainSimpler={async () => {
                      const r = await explainSimpler(it.id, userId);
                      setOverrides((m) => ({ ...m, [it.id]: r }));
                      refreshGamify(userId);
                    }}
                  />
                </CardErrorBoundary>
                {it.type !== 'reel_script' && (
                  <CardActions
                    tutorContext={tutorContext}
                    userId={userId}
                    interestTarget={{
                      artifactId: it.id,
                      documentId: it.document_id,
                      conceptId: it.concept_id,
                    }}
                    onShare={() =>
                      navigator.share?.({ title: 'NeuroFeed', text: 'Check this out' })
                    }
                  />
                )}
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

function FilterPill({ active, onClick }: { active: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-strong fixed right-3 z-30 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-soft transition-all hover:scale-[1.03] active:scale-95"
      // Sits below the TopHud and the reel progress bars (which start at
      // top-[4.5rem] inside the reel) so it never overlaps the topmost segment.
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 6.25rem)' }}
      aria-label="Open filters"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
      <span>Filters</span>
      {active > 0 && (
        <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent px-1.5 text-[10px] font-bold tabular-nums shadow-glow">
          {active}
        </span>
      )}
    </button>
  );
}

const COMPLETED_STORAGE_KEY = 'neurofeed.feed.completed.v1';

function loadCompletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(COMPLETED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((s): s is string => typeof s === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveCompletedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore quota errors
  }
}

function applyFilters(
  items: FeedItem[],
  f: FeedFilters,
  completedIds: Set<string>,
): FeedItem[] {
  const noSubject = f.subjects.size === 0;
  const noDoc = f.documentIds.size === 0;
  const noType = f.types.size === 0;
  const noDiff = f.difficulties.size === 0;

  return items.filter((it) => {
    if (!noDoc && it.document_id && !f.documentIds.has(it.document_id)) return false;
    if (!noSubject) {
      const subj = inferSubject(it.document_title ?? '');
      if (!f.subjects.has(subj)) return false;
    }
    if (!noType && !f.types.has(it.type)) return false;
    if (!noDiff && it.type === 'flashcard') {
      const d = (it.payload as Flashcard).difficulty;
      if (!f.difficulties.has(d)) return false;
    }
    if (f.hideCompleted && completedIds.has(it.id)) return false;
    return true;
  });
}

function tutorContextFor(it: FeedItem): TutorContext {
  if (it.type === 'reel_script') {
    const r = it.payload as ReelScript;
    return {
      topic: r.topic,
      sceneIndex: 0,
      totalScenes: r.scenes?.length ?? 0,
      timestampSec: 0,
      documentId: it.document_id,
      conceptId: it.concept_id,
    };
  }
  if (it.type === 'swipe_card') {
    const s = it.payload as SwipeCardData;
    return {
      topic: s.title,
      sceneSubtitle: s.body,
      sceneIndex: 0,
      totalScenes: 1,
      timestampSec: 0,
      documentId: it.document_id,
      conceptId: it.concept_id,
    };
  }
  if (it.type === 'flashcard') {
    const f = it.payload as Flashcard;
    return {
      topic: f.question,
      sceneNarration: f.answer,
      sceneIndex: 0,
      totalScenes: 1,
      timestampSec: 0,
      documentId: it.document_id,
      conceptId: it.concept_id,
    };
  }
  if (it.type === 'quiz') {
    const q = it.payload as QuizItem;
    return {
      topic: q.stem,
      sceneNarration: q.explanation,
      sceneIndex: 0,
      totalScenes: 1,
      timestampSec: 0,
      documentId: it.document_id,
      conceptId: it.concept_id,
    };
  }
  return {
    topic: it.type,
    sceneIndex: 0,
    totalScenes: 1,
    timestampSec: 0,
    documentId: it.document_id,
    conceptId: it.concept_id,
  };
}

function CardBody({
  item,
  override,
  userId,
  onComplete,
  onExplainSimpler: _onExplainSimpler,
}: {
  item: FeedItem;
  override: { title: string; body: string } | null;
  userId: string;
  onComplete: () => void;
  onExplainSimpler: () => Promise<void>;
}) {
  const refreshGamify = useGamify((s) => s.refreshAfter);
  switch (item.type) {
    case 'swipe_card':
      return <SwipeCard data={item.payload as SwipeCardData} override={override} />;
    case 'flashcard':
      return <FlashcardCard data={item.payload as Flashcard} />;
    case 'quiz':
      return (
        <QuizCard
          data={item.payload as QuizItem}
          onAnswer={(chosen, correct) => {
            void postEvent(userId, 'quiz_answer', {
              artifact_id: item.id, chosen, correct,
            });
            onComplete();
            refreshGamify(userId);
          }}
        />
      );
    case 'reel_script':
      return (
        <ReelCard
          data={item.payload as ReelScript}
          documentId={item.document_id}
          conceptId={item.concept_id}
          artifactId={item.id}
          userId={userId}
          onComplete={onComplete}
        />
      );
    default:
      return (
        <div className="h-full flex items-center justify-center text-muted">
          {item.type} (no renderer yet)
        </div>
      );
  }
}

class CardErrorBoundary extends Component<
  { children: ReactNode; type: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Card render failed:', this.props.type, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-red-900/40 via-ink to-ink p-8 text-center">
          <div className="mb-3 text-3xl">⚠</div>
          <p className="mb-1 text-sm font-semibold text-white/90">
            This {this.props.type} couldn't load
          </p>
          <p className="max-w-xs text-xs text-white/60">
            It may have been generated with an older format. Re-upload the document to refresh it.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function EmptyState({
  glyph,
  message,
  sub,
  cta,
}: {
  glyph?: React.ReactNode;
  message: string;
  sub?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center px-8 pb-28 pt-24 text-center">
      {glyph && (
        <div className="mb-5 animate-fade-in-up">{glyph}</div>
      )}
      <p className="text-balance text-xl font-bold text-white">{message}</p>
      {sub && <p className="mt-2 max-w-sm text-balance text-sm text-white/55">{sub}</p>}
      {cta && <div className="mt-6">{cta}</div>}
    </div>
  );
}

function GlyphFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/30 via-secondary/20 to-accent/30 blur-xl" />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-white shadow-soft">
        {children}
      </div>
    </div>
  );
}

function SparkGlyph() {
  return (
    <GlyphFrame>
      <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M5.6 5.6 7.7 7.7" />
        <path d="m16.3 16.3 2.1 2.1" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="M5.6 18.4 7.7 16.3" />
        <path d="m16.3 7.7 2.1-2.1" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </svg>
    </GlyphFrame>
  );
}

function LockGlyph() {
  return (
    <GlyphFrame>
      <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 1 1 8 0v4" />
      </svg>
    </GlyphFrame>
  );
}

function WarnGlyph() {
  return (
    <GlyphFrame>
      <svg className="h-9 w-9 text-rose-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    </GlyphFrame>
  );
}

function FilterGlyph() {
  return (
    <GlyphFrame>
      <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
    </GlyphFrame>
  );
}
