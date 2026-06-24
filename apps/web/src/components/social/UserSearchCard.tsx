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
    setBusy('follow'); setErr(null);
    try { await toggleFollow(user.username); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const handleSendFriend = async () => {
    setBusy('friend'); setErr(null);
    try {
      await sendFriendRequest(user.username);
      setFlash('Friend request sent');
      setTimeout(() => setFlash(null), 1800);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (variant === 'compact') {
    return (
      <li className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex items-center gap-2">
          <Avatar seed={user.avatar_seed || user.user_id} username={user.username} size={36} />
          <div className="min-w-0 flex-1">
            <Link to={`/u/${user.username}`} className="block truncate text-label-md font-bold text-on-surface hover:text-primary">
              {user.display_name || user.username}
            </Link>
            <p className="truncate text-label-sm text-on-surface-variant">@{user.username}</p>
          </div>
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-2 text-label-sm text-on-surface-variant">
          <span>L{user.level}</span>
          <span>· {user.xp.toLocaleString()} XP</span>
          <span>· {user.streak}d 🔥</span>
        </p>
        <button
          onClick={handleToggleFollow}
          disabled={busy !== null}
          className={
            following
              ? 'mt-2 w-full rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm font-bold text-on-surface disabled:opacity-50'
              : 'mt-2 w-full rounded-full bg-primary-container px-3 py-1.5 text-label-sm font-bold text-on-primary-container disabled:opacity-50'
          }
        >
          {busy === 'follow' ? '…' : following ? 'Following' : 'Follow'}
        </button>
        {err && <p className="mt-1 text-label-sm text-error">{err}</p>}
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar seed={user.avatar_seed || user.user_id} username={user.username} size={48} />
        <div className="min-w-0 flex-1">
          <Link to={`/u/${user.username}`} className="block text-label-md font-bold text-on-surface hover:text-primary">
            {user.display_name || user.username}
          </Link>
          <p className="truncate text-label-sm text-on-surface-variant">
            @{user.username}
            {user.college ? ` · ${user.college}` : ''}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-label-sm tabular-nums text-on-surface-variant">
            <span className="rounded-full bg-surface-container px-2 py-0.5">L{user.level}</span>
            <span className="rounded-full bg-surface-container px-2 py-0.5">{user.xp.toLocaleString()} XP</span>
            <span className="rounded-full bg-surface-container px-2 py-0.5">{user.streak}d 🔥</span>
            <span className="rounded-full bg-surface-container px-2 py-0.5">{user.followers_count} followers</span>
            {user.mutual_followers_count > 0 && (
              <span className="rounded-full border border-primary/30 bg-primary-container/40 px-2 py-0.5 text-on-primary-container">
                {user.mutual_followers_count} mutual
              </span>
            )}
            <LastActive iso={user.last_active} />
          </p>
          {(user.subjects ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(user.subjects ?? []).slice(0, 5).map((s) => (
                <span key={s} className="rounded-full border border-outline-variant bg-surface-container px-2 py-0.5 text-label-sm text-on-surface-variant">
                  {s}
                </span>
              ))}
            </div>
          )}
          {user.bio && <p className="mt-1.5 line-clamp-2 text-label-sm text-on-surface-variant">{user.bio}</p>}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={handleToggleFollow}
          disabled={busy !== null}
          className={
            following
              ? 'rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm font-bold text-on-surface disabled:opacity-50'
              : 'rounded-full bg-primary-container px-3 py-1.5 text-label-sm font-bold text-on-primary-container disabled:opacity-50'
          }
        >
          {busy === 'follow' ? '…' : following ? 'Following' : 'Follow'}
        </button>
        {!friend && (
          <button
            onClick={handleSendFriend}
            disabled={busy !== null}
            className="rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
          >
            {busy === 'friend' ? '…' : '+ Friend'}
          </button>
        )}
        <button
          onClick={() => { setErr(null); setChallengeOpen(true); }}
          className="inline-flex items-center gap-1 rounded-full bg-tertiary-container/40 px-3 py-1.5 text-label-sm font-bold text-on-tertiary-container"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>swords</span>
          Challenge
        </button>
        <Link
          to={`/u/${user.username}`}
          className="rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm text-on-surface hover:bg-surface-container-high"
        >
          View profile
        </Link>
      </div>

      {(err || flash) && (
        <p className={`mt-2 text-label-sm ${err ? 'text-error' : 'text-primary'}`}>
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
      className={
        fresh
          ? 'rounded-full border border-primary/40 bg-primary-container/40 px-2 py-0.5 text-on-primary-container'
          : 'rounded-full bg-surface-container px-2 py-0.5 text-on-surface-variant'
      }
    >
      {fresh ? '● ' : ''}
      {text}
    </span>
  );
}
