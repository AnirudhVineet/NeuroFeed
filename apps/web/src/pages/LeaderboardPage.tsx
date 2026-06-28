import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { SocialChips } from '@/components/social/SocialChips';
import { ErrorState, RosterSkeleton } from '@/components/social/SocialStates';
import { SUBJECTS, type Subject } from '@/lib/subjects';
import { friendlyError } from '@/lib/api';
import { fetchLeaderboard, useSocial, type ProfileMeta } from '@/lib/social';

type Scope = 'global' | 'friends' | 'college' | 'subject';

export default function LeaderboardPage() {
  const social = useSocial();
  const [scope, setScope] = useState<Scope>('global');
  const [subject, setSubject] = useState<Subject>('Networking');
  const [rows, setRows] = useState<ProfileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!social.ready) return;
    setLoading(true);
    setErr(null);
    fetchLeaderboard({ scope, subject: scope === 'subject' ? subject : undefined, limit: 100 })
      .then(setRows)
      .catch((e) => setErr(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [scope, subject, social.ready]);

  useEffect(() => {
    load();
  }, [load]);

  const myRank = useMemo(() => {
    if (!social.profile) return null;
    const idx = rows.findIndex((r) => r.user_id === social.profile?.user_id);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, social.profile]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-24">
      <SocialChips />
      <header>
        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Compete</p>
        <h1 className="text-2xl font-bold text-on-surface">Leaderboard</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Ranked by XP across NeuroFeed.</p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Toggle
          label="Scope"
          value={scope}
          onChange={(v) => setScope(v as Scope)}
          options={[
            ['global', 'Global'],
            ['friends', 'Friends'],
            ['college', 'College'],
            ['subject', 'Subject'],
          ]}
        />
        {scope === 'subject' ? (
          <Toggle label="Subject" value={subject} onChange={(v) => setSubject(v as Subject)} options={SUBJECTS.map((s) => [s, s])} />
        ) : (
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 text-xs text-on-surface-variant">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Your rank</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-on-surface">{myRank ? `#${myRank}` : '—'}</p>
            {!social.privacy.leaderboard && (
              <p className="mt-1 text-[10px] text-rose-200">You opted out of the leaderboard.</p>
            )}
          </div>
        )}
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 text-xs text-on-surface-variant">
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Your XP</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-on-surface">{(social.profile?.xp ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {err && (
        <div className="mt-6">
          <ErrorState title="Couldn't load leaderboard" message={err} onRetry={load} />
        </div>
      )}

      {loading && !err && (
        <div className="mt-6">
          <RosterSkeleton count={6} />
        </div>
      )}
      {!loading && !err && rows.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
          No learners in this scope yet.
          {scope === 'college' && (
            <span className="block mt-2 text-[11px]">Set your college in <Link to="/profile" className="text-primary">Edit profile</Link> to populate.</span>
          )}
        </p>
      )}

      <ol className="mt-4 space-y-1.5">
        {!err && rows.map((u, i) => {
          const isMe = u.user_id === social.profile?.user_id;
          return (
            <li
              key={u.user_id}
              className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${
                isMe
                  ? 'border-primary/40 bg-primary/[0.10] shadow-glow'
                  : i === 0
                    ? 'border-amber-400/30 bg-amber-500/[0.06]'
                    : 'border-outline-variant bg-surface-container-lowest'
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold tabular-nums ${
                i === 0 ? 'bg-amber-400 text-amber-950' :
                i === 1 ? 'bg-zinc-300 text-zinc-900' :
                i === 2 ? 'bg-orange-400 text-orange-950' :
                'bg-surface-container text-on-surface'
              }`}>
                {i + 1}
              </span>
              <Avatar seed={u.avatar_seed || u.user_id} username={u.username} size={36} />
              <div className="min-w-0 flex-1">
                {isMe ? (
                  <span className="text-sm font-semibold text-on-surface">You</span>
                ) : (
                  <Link to={`/u/${u.username}`} className="text-sm font-semibold text-on-surface hover:text-primary-soft">
                    {u.display_name || u.username}
                  </Link>
                )}
                <p className="truncate text-[11px] text-on-surface-variant">@{u.username}{u.college ? ` · ${u.college}` : ''}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] tabular-nums text-on-surface">
                <Stat label="XP" value={u.xp.toLocaleString()} />
                <Stat label="Streak" value={`${u.streak}d`} />
                <Stat label="Followers" value={u.followers_count} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-2">
      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              v === value
                ? 'bg-gradient-to-br from-primary via-secondary to-accent text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-full bg-surface-container px-2 py-0.5 text-on-surface">
      <span className="mr-1 text-[9px] uppercase tracking-widest text-outline">{label}</span>{value}
    </span>
  );
}
