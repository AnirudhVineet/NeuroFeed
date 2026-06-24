import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { SocialChips } from '@/components/social/SocialChips';
import {
  ErrorState,
  PartialFailBanner,
  RosterSkeleton,
  SuggestedSkeleton,
} from '@/components/social/SocialStates';
import { UserSearchCard } from '@/components/social/UserSearchCard';
import { SUBJECTS, type Subject } from '@/lib/subjects';
import { friendlyError } from '@/lib/api';
import {
  fetchSuggested,
  isFollowing,
  searchUsers,
  toggleFollow,
  useSocial,
  type SuggestedBuckets,
  type UserSearchHit,
} from '@/lib/social';

// Explore / Discover page on the new clinical light theme. Layout matches
// mockup `home/explore.html` for the trending row + suggested creators strip;
// search and ranked-people buckets are powered by the existing /api/social
// endpoints. A real masonry feed of trending content + a hashtag system are
// flagged as backend follow-ups (see notes inline).

const DEBOUNCE_MS = 300;
const PAGE = 20;

// Curated default subject chips for the "Trending" row when we don't yet have
// per-user signal. Once a hashtag/topic-signal endpoint exists, this should be
// replaced with real data from /api/social or a new /api/trending route.
const TRENDING_PLACEHOLDER: Subject[] = ['AI', 'ML', 'OS', 'DBMS', 'Networking', 'Physics'];

export default function DiscoverPage() {
  const social = useSocial();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [subject, setSubject] = useState<Subject | 'all'>('all');

  // Search state
  const [results, setResults] = useState<UserSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Suggested buckets (shown when search is empty)
  const [suggested, setSuggested] = useState<SuggestedBuckets | null>(null);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [suggestedErr, setSuggestedErr] = useState<string | null>(null);

  // Debounce q -> debouncedQ + keep URL in sync (without bashing back-button
  // history every keystroke).
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = q.trim();
      setDebouncedQ(trimmed);
      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // URL → input (handles TopBar submitting a new ?q= while we're on /discover)
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ !== q) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isSearching = debouncedQ.length > 0 || subject !== 'all';

  const loadSuggested = useCallback(async () => {
    setSuggestedLoading(true);
    setSuggestedErr(null);
    try {
      const r = await fetchSuggested(8);
      setSuggested(r);
    } catch (e) {
      setSuggestedErr(friendlyError(e));
    } finally {
      setSuggestedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!social.user_id) return;
    void loadSuggested();
  }, [loadSuggested, social.user_id]);

  const searchSeqRef = useRef(0);
  const runSearch = useCallback(
    async (query: string, subj: Subject | 'all', offset = 0, append = false) => {
      const seq = ++searchSeqRef.current;
      if (offset === 0) setSearchLoading(true);
      else setLoadingMore(true);
      setSearchErr(null);
      try {
        const items = await searchUsers({
          q: query || undefined,
          subject: subj === 'all' ? undefined : subj,
          limit: PAGE,
          offset,
        });
        if (seq !== searchSeqRef.current) return;
        setResults((prev) => (append ? [...prev, ...items] : items));
        setHasMore(items.length === PAGE);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        setSearchErr(friendlyError(e));
        if (!append) setResults([]);
      } finally {
        if (seq !== searchSeqRef.current) return;
        setSearchLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isSearching) {
      setResults([]);
      setHasMore(false);
      setSearchLoading(false);
      setSearchErr(null);
      return;
    }
    if (!social.user_id) return;
    void runSearch(debouncedQ, subject, 0, false);
  }, [debouncedQ, subject, isSearching, runSearch, social.user_id]);

  const followingNames = useMemo(
    () => new Set(social.following.map((u) => u.username)),
    [social.following],
  );
  const filterNotFollowed = useCallback(
    (rows: UserSearchHit[]) => rows.filter((u) => !followingNames.has(u.username)),
    [followingNames],
  );

  const popularSubjects = useMemo(() => {
    if (!suggested) return TRENDING_PLACEHOLDER;
    const counts = new Map<string, number>();
    for (const bucket of [suggested.trending, suggested.top_streaks, suggested.recent_uploaders]) {
      for (const u of bucket) {
        for (const s of u.subjects ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    const derived = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s]) => s as Subject);
    return derived.length >= 3 ? derived : TRENDING_PLACEHOLDER;
  }, [suggested]);

  return (
    <div className="mx-auto max-w-4xl px-md py-md">
      <SocialChips />

      {/* Trending subjects strip — placeholder until a real trending/hashtag
          signal exists in the backend. */}
      <section className="mb-md">
        <div className="no-scrollbar flex items-center gap-sm overflow-x-auto py-1">
          <span className="shrink-0 text-label-md font-bold text-primary">Trending:</span>
          {popularSubjects.map((s, i) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={
                i === 0 || subject === s
                  ? 'shrink-0 rounded-full bg-primary-container/40 px-4 py-1.5 text-label-md font-bold text-on-primary-container transition-colors hover:bg-primary-container/60'
                  : 'shrink-0 rounded-full bg-surface-container px-4 py-1.5 text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high'
              }
            >
              #{s}
            </button>
          ))}
        </div>
      </section>

      {/* Rising Educators horizontal strip — uses real `suggested.trending`
          (top-followed people) until a "rising creators" signal exists. */}
      {suggested && suggested.trending.length > 0 && (
        <section className="mb-lg">
          <div className="mb-sm flex items-center justify-between px-1">
            <h2 className="text-headline-sm text-on-surface">Rising Educators</h2>
            <span className="text-label-md text-on-surface-variant">{suggested.trending.length} to discover</span>
          </div>
          <div className="no-scrollbar flex gap-md overflow-x-auto pb-2 pl-1">
            {suggested.trending.slice(0, 8).map((u) => (
              <RisingEducator key={u.user_id} user={u} />
            ))}
          </div>
        </section>
      )}

      {/* Search bar */}
      <section className="mb-md rounded-xl border border-outline-variant bg-surface-container-lowest p-base">
        <div className="flex flex-wrap items-center gap-sm">
          <div className="relative min-w-[200px] flex-1">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline"
              style={{ fontSize: '20px' }}
              aria-hidden
            >
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users by username, name, or bio…"
              aria-label="Search users"
              className="w-full rounded-full border border-outline-variant bg-surface py-2.5 pl-10 pr-10 text-body-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-surface-container px-2 py-0.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as Subject | 'all')}
            className="rounded-full border border-outline-variant bg-surface px-3 py-2 text-label-sm text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="all">All subjects</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Search results OR suggestion buckets */}
      {isSearching ? (
        <section>
          <h2 className="mb-sm flex items-baseline justify-between text-label-sm uppercase tracking-widest text-on-surface-variant">
            <span>
              Results
              {!searchLoading && !searchErr && (
                <span className="ml-2 normal-case tracking-normal text-on-surface-variant/70">
                  ({results.length}{hasMore ? '+' : ''})
                </span>
              )}
            </span>
            {searchLoading && <span className="text-label-sm text-outline">Searching…</span>}
          </h2>

          {searchErr && (
            <ErrorState
              title="Search unavailable"
              message={searchErr}
              onRetry={() => void runSearch(debouncedQ, subject, 0, false)}
            />
          )}
          {!searchErr && searchLoading && results.length === 0 && <RosterSkeleton count={5} />}
          {!searchErr && !searchLoading && results.length === 0 && (
            <div className="rounded-xl border border-dashed border-outline-variant p-xl text-center text-body-sm text-on-surface-variant">
              <p>No users found.</p>
              <p className="mt-1 text-label-sm text-outline">
                Try a different keyword, or clear the filter.
              </p>
            </div>
          )}
          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map((u) => (
                <UserSearchCard key={u.user_id} user={u} />
              ))}
            </ul>
          )}
          {hasMore && results.length > 0 && (
            <button
              onClick={() => { if (hasMore && !loadingMore) void runSearch(debouncedQ, subject, results.length, true); }}
              disabled={loadingMore}
              className="mt-3 w-full rounded-full border border-outline-variant bg-surface-container py-2.5 text-label-md font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
      ) : (
        <SuggestedView
          state={{ suggested, loading: suggestedLoading, err: suggestedErr }}
          onRetry={loadSuggested}
          filterNotFollowed={filterNotFollowed}
        />
      )}
    </div>
  );
}

function RisingEducator({ user }: { user: UserSearchHit }) {
  const following = isFollowing(user.username);
  const [busy, setBusy] = useState(false);

  function onFollow() {
    setBusy(true);
    void toggleFollow(user.username).finally(() => setBusy(false));
  }

  return (
    <div className="flex min-w-[120px] shrink-0 flex-col items-center gap-1.5">
      <a href={`/u/${user.username}`} className="block">
        <div className="rounded-full border-2 border-primary p-[2px] transition-transform hover:scale-105">
          <Avatar
            seed={user.avatar_seed || user.user_id}
            username={user.username}
            size={64}
            linkTo={false}
          />
        </div>
      </a>
      <a
        href={`/u/${user.username}`}
        className="block max-w-[120px] truncate text-center text-label-sm text-on-surface hover:text-primary"
      >
        {user.display_name || user.username}
      </a>
      <button
        onClick={onFollow}
        disabled={busy || following}
        className={
          following
            ? 'rounded-full bg-surface-container px-3 py-0.5 text-[10px] font-bold text-on-surface-variant'
            : 'rounded-full bg-primary-container px-3 py-0.5 text-[10px] font-bold text-on-primary-container disabled:opacity-50'
        }
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

function SuggestedView({
  state,
  onRetry,
  filterNotFollowed,
}: {
  state: { suggested: SuggestedBuckets | null; loading: boolean; err: string | null };
  onRetry: () => void;
  filterNotFollowed: (rows: UserSearchHit[]) => UserSearchHit[];
}) {
  const { suggested, loading, err } = state;

  if (err && !suggested) {
    return <ErrorState title="Unable to load suggestions" message={err} onRetry={onRetry} />;
  }

  if (loading && !suggested) {
    return (
      <div className="space-y-md">
        <section>
          <SectionHeader title="Trending learners" />
          <SuggestedSkeleton count={4} />
        </section>
        <section>
          <SectionHeader title="Top streaks" />
          <SuggestedSkeleton count={4} />
        </section>
      </div>
    );
  }

  if (!suggested) return null;

  const trending = filterNotFollowed(suggested.trending);
  const topStreaks = filterNotFollowed(suggested.top_streaks);
  const recent = filterNotFollowed(suggested.recent_uploaders);
  const mutual = filterNotFollowed(suggested.mutual_interests);

  const allEmpty = !trending.length && !topStreaks.length && !recent.length && !mutual.length;

  if (allEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant p-xl text-center text-body-sm text-on-surface-variant">
        <p className="text-headline-sm text-on-surface">Be the first learner here.</p>
        <p className="mt-1.5 text-label-md">Invite a friend or upload a doc to put yourself on the map.</p>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {err && (
        <PartialFailBanner
          message="Some suggestions couldn't refresh — showing the rest."
          onRetry={onRetry}
        />
      )}

      {mutual.length > 0 && (
        <Bucket title="Mutual interests" subtitle="Studying the same subjects as you" rows={mutual} />
      )}
      {trending.length > 0 && (
        <Bucket title="Trending learners" subtitle="Most-followed in the community" rows={trending} />
      )}
      {topStreaks.length > 0 && (
        <Bucket title="Top streaks" subtitle="On a roll right now" rows={topStreaks} />
      )}
      {recent.length > 0 && (
        <Bucket title="Recent uploaders" subtitle="Just dropped new documents" rows={recent} />
      )}
    </div>
  );
}

function Bucket({ title, subtitle, rows }: { title: string; subtitle?: string; rows: UserSearchHit[] }) {
  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} />
      <ul className="grid grid-cols-2 gap-gutter sm:grid-cols-3">
        {rows.slice(0, 6).map((u) => (
          <UserSearchCard key={u.user_id} user={u} variant="compact" />
        ))}
      </ul>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-sm">
      <h2 className="text-headline-sm text-on-surface">{title}</h2>
      {subtitle && <p className="mt-0.5 text-label-md text-on-surface-variant">{subtitle}</p>}
    </div>
  );
}
