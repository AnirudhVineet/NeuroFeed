import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  searchUsers,
  useSocial,
  type SuggestedBuckets,
  type UserSearchHit,
} from '@/lib/social';

const DEBOUNCE_MS = 300;
const PAGE = 20;

export default function DiscoverPage() {
  const social = useSocial();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [subject, setSubject] = useState<Subject | 'all'>('all');

  // Search state
  const [results, setResults] = useState<UserSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Suggested-state (shown when search is empty)
  const [suggested, setSuggested] = useState<SuggestedBuckets | null>(null);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [suggestedErr, setSuggestedErr] = useState<string | null>(null);

  // Debounce the q -> debouncedQ
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const isSearching = debouncedQ.length > 0 || subject !== 'all';

  // -------- Suggested buckets --------
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
    void loadSuggested();
  }, [loadSuggested]);

  // -------- Search --------
  // Track the latest in-flight query so out-of-order responses don't clobber.
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
        if (seq !== searchSeqRef.current) return; // stale
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

  // Fire a search whenever the debounced query / subject changes (but only
  // when there is something to search; otherwise show suggestions).
  useEffect(() => {
    if (!isSearching) {
      setResults([]);
      setHasMore(false);
      setSearchLoading(false);
      setSearchErr(null);
      return;
    }
    void runSearch(debouncedQ, subject, 0, false);
  }, [debouncedQ, subject, isSearching, runSearch]);

  const onRetrySearch = () => {
    void runSearch(debouncedQ, subject, 0, false);
  };

  const onLoadMore = () => {
    if (!hasMore || loadingMore) return;
    void runSearch(debouncedQ, subject, results.length, true);
  };

  // Filter suggestions to people not yet followed (best-effort).
  const followingNames = useMemo(
    () => new Set(social.following.map((u) => u.username)),
    [social.following],
  );
  const filterNotFollowed = useCallback(
    (rows: UserSearchHit[]) => rows.filter((u) => !followingNames.has(u.username)),
    [followingNames],
  );

  // Popular subjects = top 5 subjects by frequency across trending+top_streaks.
  const popularSubjects = useMemo(() => {
    if (!suggested) return [] as Subject[];
    const counts = new Map<string, number>();
    for (const bucket of [suggested.trending, suggested.top_streaks, suggested.recent_uploaders]) {
      for (const u of bucket) {
        for (const s of u.subjects ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s]) => s as Subject);
  }, [suggested]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-32 pt-24">
      <SocialChips />

      <header>
        <p className="text-[10px] uppercase tracking-widest text-white/55">Social</p>
        <h1 className="text-2xl font-bold text-white">Discover learners</h1>
        <p className="mt-1 text-sm text-white/65">
          Search by username, name, bio, or subject. Follow, challenge, friend.
        </p>
      </header>

      {/* Search bar */}
      <section className="sticky top-20 z-10 mt-4 -mx-1 rounded-2xl bg-ink/80 px-1 py-1 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
              🔍
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users..."
              aria-label="Search users"
              className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pl-9 pr-9 text-sm text-white outline-none placeholder:text-white/40 focus:border-primary"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/20"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as Subject | 'all')}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-primary"
          >
            <option value="all">All subjects</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Search results OR suggestions */}
      {isSearching ? (
        <section className="mt-4">
          <h2 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-widest text-white/55">
            <span>
              Results
              {!searchLoading && !searchErr && (
                <span className="ml-2 normal-case tracking-normal text-white/45">
                  ({results.length}
                  {hasMore ? '+' : ''})
                </span>
              )}
            </span>
            {searchLoading && <span className="text-[10px] text-white/45">Searching…</span>}
          </h2>

          {searchErr && (
            <ErrorState
              title="Search unavailable"
              message={searchErr}
              onRetry={onRetrySearch}
            />
          )}

          {!searchErr && searchLoading && results.length === 0 && <RosterSkeleton count={5} />}

          {!searchErr && !searchLoading && results.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/55">
              <p>No users found.</p>
              <p className="mt-1 text-[11px] text-white/45">
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
              onClick={onLoadMore}
              disabled={loadingMore}
              className="mt-3 w-full rounded-full border border-white/10 bg-white/[0.04] py-2.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
      ) : (
        <SuggestedView
          state={{ suggested, loading: suggestedLoading, err: suggestedErr }}
          popularSubjects={popularSubjects}
          onPickSubject={(s) => setSubject(s)}
          onRetry={loadSuggested}
          filterNotFollowed={filterNotFollowed}
        />
      )}
    </div>
  );
}

function SuggestedView({
  state,
  popularSubjects,
  onPickSubject,
  onRetry,
  filterNotFollowed,
}: {
  state: { suggested: SuggestedBuckets | null; loading: boolean; err: string | null };
  popularSubjects: Subject[];
  onPickSubject: (s: Subject) => void;
  onRetry: () => void;
  filterNotFollowed: (rows: UserSearchHit[]) => UserSearchHit[];
}) {
  const { suggested, loading, err } = state;

  if (err && !suggested) {
    return (
      <div className="mt-6">
        <ErrorState
          title="Unable to load suggestions"
          message={err}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (loading && !suggested) {
    return (
      <div className="mt-6 space-y-6">
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

  const allEmpty =
    trending.length === 0 &&
    topStreaks.length === 0 &&
    recent.length === 0 &&
    mutual.length === 0;

  if (allEmpty) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/70">
        <p className="text-base font-semibold text-white">Be the first learner in the community.</p>
        <p className="mt-1.5 text-[12px] text-white/55">
          Invite a friend, or upload a doc to put yourself on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {err && (
        <PartialFailBanner
          message="Some suggestions couldn't refresh — showing the rest."
          onRetry={onRetry}
        />
      )}

      {mutual.length > 0 && (
        <Bucket
          title="Mutual interests"
          subtitle="Studying the same subjects as you"
          rows={mutual}
        />
      )}
      {trending.length > 0 && (
        <Bucket title="Trending learners" subtitle="Most-followed in the community" rows={trending} />
      )}
      {topStreaks.length > 0 && (
        <Bucket title="Top streaks" subtitle="On a roll right now 🔥" rows={topStreaks} />
      )}
      {recent.length > 0 && (
        <Bucket
          title="Recent uploaders"
          subtitle="Just dropped new documents"
          rows={recent}
        />
      )}

      {popularSubjects.length > 0 && (
        <section>
          <SectionHeader title="Popular subjects" />
          <div className="flex flex-wrap gap-1.5">
            {popularSubjects.map((s) => (
              <button
                key={s}
                onClick={() => onPickSubject(s)}
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
              >
                #{s}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Bucket({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: UserSearchHit[];
}) {
  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.slice(0, 6).map((u) => (
          <UserSearchCard key={u.user_id} user={u} variant="compact" />
        ))}
      </ul>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/55">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11px] text-white/45">{subtitle}</p>}
    </div>
  );
}
