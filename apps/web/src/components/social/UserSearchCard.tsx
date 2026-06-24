import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { ChallengeDialog } from './ChallengeDialog';
import {
  isFollowing,
  isFriend,
  sendFriendRequest,
  toggleFollow,
  type UserSearchHit,
} from '@/lib/social';
import { friendlyError } from '@/lib/api';

interface Props {
  user: UserSearchHit;
  variant?: 'row' | 'compact';
}

export function UserSearchCard({ user, variant = 'row' }: Props) {
  const [busy, setBusy] = useState<'follow' | 'friend' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const following = isFollowing(user.username);
  const friend = isFriend(user.username);

  const handleToggleFollow = async () => {
    setBusy('follow');
    setErr(null);
    try {
      await toggleFollow(user.username);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSendFriend = async () => {
    setBusy('friend');
    setErr(null);
    try {
      await sendFriendRequest(user.username);
      setFlash('Friend request sent');
      setTimeout(() => setFlash(null), 1800);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const openChallenge = () => {
    setErr(null);
    setChallengeOpen(true);
  };

  if (variant === 'compact') {
    return (
      <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-2">
          <Avatar seed={user.avatar_seed || user.user_id} username={user.username} size={36} />
          <div className="min-w-0 flex-1">
            <Link to={`/u/${user.username}`} className="block truncate text-sm font-semibold text-white">
              {user.display_name || user.username}
            </Link>
            <p className="truncate text-[10px] text-white/55">@{user.username}</p>
          </div>
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-white/65">
          <span>L{user.level}</span>
          <span>· {user.xp.toLocaleString()} XP</span>
          <span>· {user.streak}d 🔥</span>
        </p>
        <button
          onClick={handleToggleFollow}
          disabled={busy !== null}
          className={`mt-2 w-full rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
            following
              ? 'border border-white/15 bg-white/[0.06] text-white'
              : 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
          }`}
        >
          {busy === 'follow' ? '…' : following ? 'Following' : 'Follow'}
        </button>
        {err && <p className="mt-1 text-[10px] text-rose-300">{err}</p>}
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar seed={user.avatar_seed || user.user_id} username={user.username} size={48} />
        <div className="min-w-0 flex-1">
          <Link
            to={`/u/${user.username}`}
            className="block text-sm font-semibold text-white hover:text-primary-soft"
          >
            {user.display_name || user.username}
          </Link>
          <p className="truncate text-[11px] text-white/55">
            @{user.username}
            {user.college ? ` · ${user.college}` : ''}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-white/75">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5">L{user.level}</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5">{user.xp.toLocaleString()} XP</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5">{user.streak}d 🔥</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5">{user.followers_count} followers</span>
            {user.mutual_followers_count > 0 && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary-soft">
                {user.mutual_followers_count} mutual
              </span>
            )}
            <LastActive iso={user.last_active} />
          </p>
          {(user.subjects ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(user.subjects ?? []).slice(0, 5).map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/70"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {user.bio && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-white/65">{user.bio}</p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={handleToggleFollow}
          disabled={busy !== null}
          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
            following
              ? 'border border-white/15 bg-white/[0.06] text-white'
              : 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
          }`}
        >
          {busy === 'follow' ? '…' : following ? 'Following' : 'Follow'}
        </button>
        {!friend && (
          <button
            onClick={handleSendFriend}
            disabled={busy !== null}
            className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
          >
            {busy === 'friend' ? '…' : '+ Friend'}
          </button>
        )}
        <button
          onClick={openChallenge}
          className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-white"
        >
          ⚔ Challenge
        </button>
        <Link
          to={`/u/${user.username}`}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/85 hover:bg-white/10"
        >
          View profile
        </Link>
        <Link
          to={`/u/${user.username}#uploads`}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/85 hover:bg-white/10"
        >
          Uploads
        </Link>
      </div>

      {(err || flash) && (
        <p
          className={`mt-2 text-[11px] ${
            err ? 'text-rose-300' : 'text-emerald-200'
          }`}
        >
          {err ?? flash}
        </p>
      )}

      <ChallengeDialog
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        opponent={{
          username: user.username,
          display_name: user.display_name,
          avatar_seed: user.avatar_seed,
          user_id: user.user_id,
        }}
      />
    </li>
  );
}

function LastActive({ iso }: { iso?: string | null }) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  const m = Math.round(diff / 60_000);
  let text: string;
  if (m < 5) text = 'active now';
  else if (m < 60) text = `${m}m ago`;
  else if (m < 60 * 24) text = `${Math.round(m / 60)}h ago`;
  else text = `${Math.round(m / 60 / 24)}d ago`;
  const fresh = m < 5;
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        fresh
          ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
          : 'bg-white/[0.06] text-white/70'
      }`}
    >
      {fresh ? '● ' : ''}
      {text}
    </span>
  );
}
