import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { SocialChips } from '@/components/social/SocialChips';
import { ErrorState, RosterSkeleton } from '@/components/social/SocialStates';
import { friendlyError } from '@/lib/api';
import {
  patchProfile,
  refreshActivityScope,
  useSocial,
  type ActivityRow,
} from '@/lib/social';

type Filter = 'all' | 'mine' | 'following' | 'friends';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'following', label: 'Following' },
  { id: 'friends', label: 'Friends' },
  { id: 'mine', label: 'Just me' },
];

export default function ActivityFeedPage() {
  const social = useSocial();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!social.ready) return;
    setLoading(true);
    setErr(null);
    refreshActivityScope(filter)
      .then(setRows)
      .catch((e) => setErr(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [filter, social.ready]);

  useEffect(() => {
    load();
  }, [load, social.activity.length]);

  const hiddenActivity = social.profile?.hidden_activity ?? false;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-24">
      <SocialChips />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Feed</p>
          <h1 className="text-2xl font-bold text-on-surface">What everyone's learning</h1>
        </div>
        <button
          onClick={() => patchProfile({ hidden_activity: !hiddenActivity })}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
            hiddenActivity
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
              : 'border-outline bg-surface-container text-on-surface'
          }`}
        >
          {hiddenActivity ? 'Your activity: hidden' : 'Your activity: visible'}
        </button>
      </header>

      <div className="mt-3 flex flex-wrap gap-1 rounded-full border border-outline-variant bg-surface-container p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.id
                ? 'bg-gradient-to-br from-primary via-secondary to-accent text-on-primary shadow-glow'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mt-4">
          <ErrorState
            title="Couldn't load activity"
            message={err}
            onRetry={load}
          />
        </div>
      )}

      {loading && !err && (
        <div className="mt-4">
          <RosterSkeleton count={4} />
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {!loading && !err && rows.length === 0 && (
          <li className="rounded-2xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
            Nothing to show in this filter.
          </li>
        )}
        {!loading && !err && rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <div className="flex items-start gap-3">
              <Avatar
                seed={r.actor_avatar_seed || r.actor_username}
                username={r.actor_username}
                size={36}
              />
              <div className="min-w-0 flex-1 text-sm text-on-surface">
                <p>
                  <Link to={`/u/${r.actor_username}`} className="font-semibold text-on-surface hover:text-primary-soft">
                    @{r.actor_username}
                  </Link>{' '}
                  <span className="text-on-surface-variant">{r.verb}</span>{' '}
                  <span className="font-semibold text-on-surface">{r.object_text}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-outline">{relTime(r.ts)}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
