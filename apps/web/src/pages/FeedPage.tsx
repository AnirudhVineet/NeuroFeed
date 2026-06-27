import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  countActive,
  emptyFilters,
  FilterSheet,
  type DocOption,
  type FeedFilters,
} from '@/components/feed/FilterSheet';
import { FlashcardCard } from '@/components/feed/FlashcardCard';
import { QuizCard } from '@/components/feed/QuizCard';
import { ReelFeedCard } from '@/components/feed/ReelFeedCard';
import { ReelOverlay } from '@/components/feed/ReelOverlay';
import { StoriesRow, type StoryDoc } from '@/components/feed/StoriesRow';
import { SwipeCard } from '@/components/feed/SwipeCard';
import { QuickLearningSheet } from '@/components/feed/QuickLearningSheet';
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

// Card-based home feed. Vertical scroll of 4:5 Instagram-style reel cards
// interspersed with smaller cards for other artifact types. Reels open the
// existing fullscreen ReelCard engine in an overlay so the visual_beats
// engine + karaoke captions + tutor panel stay intact.

export default function FeedPage() {
  const navigate = useNavigate();
  // Seed items from the last-cached feed so the launch shows real content
  // immediately and only the revalidation network round-trip happens in the
  // background. Without this, items is [] until /api/feed resolves and the
  // empty-state ("Upload now") flashes for the entire request duration.
  const [items, setItems] = useState<FeedItem[]>(() => loadCachedFeed());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [overrides, setOverrides] = useState<
    Record<string, { title: string; body: string } | null>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>(() => emptyFilters());
  const [filterOpen, setFilterOpen] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => loadCompletedIds());
  const [openedReel, setOpenedReel] = useState<FeedItem | null>(null);
  const [quickLearning, setQuickLearning] = useState<FeedItem | null>(null);
  const refreshGamify = useGamify((s) => s.refreshAfter);

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

  const storyDocs = useMemo<StoryDoc[]>(
    () => docOptions.map((d) => ({ id: d.id, title: d.title })),
    [docOptions],
  );

  const visibleItems = useMemo(
    () => applyFilters(items, filters, completedIds),
    [items, filters, completedIds],
  );
  const activeCount = countActive(filters);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        // Unauthenticated landing — the home feed is gated, so route the user
        // to the auth page instead of showing a sign-in CTA panel.
        navigate('/auth', { replace: true });
        return;
      }
      setUserId(uid);
      setAuthChecked(true);
      try {
        const res = await fetchFeed(uid);
        setItems(res.items);
        saveCachedFeed(res.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  function markCompleted(id: string) {
    setCompletedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveCompletedIds(next);
      return next;
    });
  }

  // While we resolve the Supabase session, render a skeleton. If there's no
  // user, the effect above navigates to /auth, so we never settle here without
  // a userId.
  if (!authChecked || !userId) {
    return <FeedLoadingSkeleton />;
  }
  if (error) {
    return (
      <EmptyState
        icon="error"
        message="Something went wrong."
        sub={error}
      />
    );
  }
  // Skeleton while the initial fetch is still in flight and we don't have any
  // cached items to paint. Without this, the "Your feed is empty / Upload now"
  // panel below flashes for the entire request duration even when the user
  // does have a populated feed.
  if (loading && items.length === 0) {
    return <FeedLoadingSkeleton />;
  }
  // Real "empty" state — only show it once we know the fetch finished and
  // there really is nothing to show.
  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon="auto_awesome"
        message="Your feed is empty."
        sub="Upload a document and we'll turn it into reels, flashcards, and quizzes."
        cta={
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-5 py-2.5 text-label-md font-bold text-on-primary-container transition-all hover:brightness-95"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span>
            Upload now
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="mx-auto max-w-2xl px-md pt-md">
        {storyDocs.length > 0 && <StoriesRow docs={storyDocs} />}

        <div className="mb-md flex items-center justify-between gap-sm">
          <h1 className="text-headline-sm text-on-surface">For you</h1>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label="Open filters"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_list</span>
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-primary">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {visibleItems.length === 0 ? (
          <EmptyState
            icon="filter_alt"
            message="No items match these filters."
            sub="Try loosening a filter or clear them all to see your full feed."
            cta={
              <button
                onClick={() => setFilters(emptyFilters())}
                className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-bold text-on-primary-container hover:brightness-95"
              >
                Clear filters
              </button>
            }
            inline
          />
        ) : (
          <ul className="space-y-md pb-md">
            {visibleItems.map((it) => (
              <li key={`${it.id}-${it.created_at}`}>
                <CardErrorBoundary type={it.type}>
                  <FeedItemRender
                    item={it}
                    override={overrides[it.id] ?? null}
                    userId={userId}
                    isOpenedInOverlay={openedReel?.id === it.id}
                    onComplete={() => markCompleted(it.id)}
                    onExplainSimpler={async () => {
                      const r = await explainSimpler(it.id, userId);
                      setOverrides((m) => ({ ...m, [it.id]: r }));
                      refreshGamify(userId);
                    }}
                    onOpenReel={() => setOpenedReel(it)}
                    onOpenQuickLearning={() => setQuickLearning(it)}
                  />
                </CardErrorBoundary>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FilterSheet
        open={filterOpen}
        filters={filters}
        docs={docOptions}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        onClear={() => setFilters(emptyFilters())}
      />

      {openedReel && openedReel.type === 'reel_script' && (
        <ReelOverlay
          reel={openedReel.payload as ReelScript}
          documentId={openedReel.document_id}
          conceptId={openedReel.concept_id}
          artifactId={openedReel.id}
          userId={userId}
          onComplete={() => {
            markCompleted(openedReel.id);
            refreshGamify(userId);
          }}
          onClose={() => setOpenedReel(null)}
        />
      )}

      {quickLearning && (
        <QuickLearningSheet
          open={true}
          onClose={() => setQuickLearning(null)}
          topic={topicFromItem(quickLearning)}
          documentId={quickLearning.document_id}
          conceptId={quickLearning.concept_id ?? null}
          userId={userId}
          onOpenTutor={() => {
            // Tutor opens fullscreen inside the reel overlay; from the home
            // feed we route the user there instead of mounting a second
            // TutorPanel. If they opened Quick Learning without a reel
            // context, the tutor tab in the sheet becomes a no-op for now.
            if (quickLearning.type === 'reel_script') {
              setQuickLearning(null);
              setOpenedReel(quickLearning);
            }
          }}
        />
      )}
    </>
  );
}

function topicFromItem(it: FeedItem): string {
  if (it.type === 'reel_script') return (it.payload as ReelScript).topic;
  if (it.type === 'swipe_card') return (it.payload as SwipeCardData).title;
  if (it.type === 'flashcard') return (it.payload as Flashcard).question;
  if (it.type === 'quiz') return (it.payload as QuizItem).stem;
  return it.document_title ?? it.type;
}

function FeedItemRender({
  item,
  override,
  userId,
  isOpenedInOverlay,
  onComplete,
  onExplainSimpler: _onExplainSimpler,
  onOpenReel,
  onOpenQuickLearning,
}: {
  item: FeedItem;
  override: { title: string; body: string } | null;
  userId: string;
  isOpenedInOverlay: boolean;
  onComplete: () => void;
  onExplainSimpler: () => Promise<void>;
  onOpenReel: () => void;
  onOpenQuickLearning: () => void;
}) {
  const refreshGamify = useGamify((s) => s.refreshAfter);
  switch (item.type) {
    case 'reel_script':
      return (
        <ReelFeedCard
          reel={item.payload as ReelScript}
          documentTitle={item.document_title}
          artifactId={item.id}
          documentId={item.document_id}
          conceptId={item.concept_id}
          userId={userId}
          isOpenedInOverlay={isOpenedInOverlay}
          onOpen={onOpenReel}
          onQuickLearning={onOpenQuickLearning}
        />
      );
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
              artifact_id: item.id,
              chosen,
              correct,
            });
            onComplete();
            refreshGamify(userId);
          }}
        />
      );
    case 'summary':
      return (
        <SummaryFeedCard
          payload={item.payload as { tldr?: string; bullets?: string[] }}
          documentTitle={item.document_title}
        />
      );
    default:
      return (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-md text-center text-body-sm text-on-surface-variant">
          {item.type} (no renderer yet)
        </div>
      );
  }
}

function SummaryFeedCard({
  payload,
  documentTitle,
}: {
  payload: { tldr?: string; bullets?: string[] };
  documentTitle?: string | null;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-md">
      <div className="mb-sm flex items-center gap-2">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          summarize
        </span>
        <span className="text-label-sm uppercase tracking-widest text-primary">Summary</span>
        {documentTitle && (
          <span className="ml-auto truncate text-[11px] text-on-surface-variant">
            {documentTitle}
          </span>
        )}
      </div>
      <p className="mb-md text-headline-sm text-on-surface">
        {payload.tldr ?? 'No summary available.'}
      </p>
      {payload.bullets?.length ? (
        <ul className="space-y-2 text-body-md text-on-surface-variant">
          {payload.bullets.slice(0, 5).map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
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
        <div className="flex flex-col items-center gap-2 rounded-xl border border-error/30 bg-error-container/40 p-md text-center">
          <span className="material-symbols-outlined text-error" style={{ fontSize: '28px' }}>
            warning
          </span>
          <p className="text-label-md font-bold text-on-error-container">
            This {this.props.type} couldn't load
          </p>
          <p className="max-w-xs text-body-sm text-on-error-container">
            It may have been generated with an older format. Re-upload the document to refresh it.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function EmptyState({
  icon,
  message,
  sub,
  cta,
  inline,
}: {
  icon?: string;
  message: string;
  sub?: string;
  cta?: ReactNode;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? 'flex flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container-low p-xl text-center'
          : 'mx-auto flex max-w-md flex-col items-center justify-center px-md py-xl text-center'
      }
    >
      {icon && (
        <span
          className="material-symbols-outlined mb-md text-primary"
          style={{ fontSize: '48px' }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <p className="text-headline-sm text-on-surface">{message}</p>
      {sub && <p className="mt-2 max-w-sm text-body-sm text-on-surface-variant">{sub}</p>}
      {cta && <div className="mt-md">{cta}</div>}
    </div>
  );
}

function FeedLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-md pt-md" aria-busy="true">
      <div className="mb-md flex items-center justify-between gap-sm">
        <span className="block h-6 w-24 animate-pulse rounded bg-surface-container" />
        <span className="block h-8 w-20 animate-pulse rounded-full bg-surface-container" />
      </div>
      <ul className="space-y-md pb-md">
        {Array.from({ length: 2 }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-xl border border-outline-variant bg-surface"
          >
            <div className="flex items-center gap-sm p-md">
              <span className="block h-10 w-10 animate-pulse rounded-full bg-surface-container" />
              <div className="flex-1 space-y-2">
                <span className="block h-3 w-1/3 animate-pulse rounded bg-surface-container" />
                <span className="block h-3 w-1/2 animate-pulse rounded bg-surface-container-low" />
              </div>
            </div>
            <span className="block aspect-[4/5] w-full animate-pulse bg-surface-container-low" />
            <div className="p-md">
              <span className="block h-9 w-full animate-pulse rounded-lg bg-surface-container" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const COMPLETED_STORAGE_KEY = 'neurofeed.feed.completed.v1';
const FEED_CACHE_KEY = 'neurofeed.feed.cache.v1';
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;

function loadCachedFeed(): FeedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts?: number; items?: FeedItem[] };
    if (!parsed?.ts || !Array.isArray(parsed.items)) return [];
    if (Date.now() - parsed.ts > FEED_CACHE_TTL_MS) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

function saveCachedFeed(items: FeedItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      FEED_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), items }),
    );
  } catch {
    /* ignore quota errors */
  }
}

function loadCompletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(COMPLETED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? new Set(arr.filter((s): s is string => typeof s === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveCompletedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore quota errors */
  }
}

// Artifact types the feed knows how to render. Anything else (e.g. the
// deprecated `learning_path_step` that the backend may still emit for older
// documents) is dropped before it reaches FeedItemRender so the feed never
// shows a "(no renderer yet)" placeholder for it.
const RENDERABLE_TYPES: ReadonlySet<string> = new Set([
  'reel_script',
  'swipe_card',
  'flashcard',
  'quiz',
  'summary',
]);

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
    if (!RENDERABLE_TYPES.has(it.type)) return false;
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
