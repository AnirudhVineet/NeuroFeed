// Top-right toast popups for fresh notifications. Each toast auto-dismisses
// after 5 seconds; the user can also dismiss manually. Toasts stack
// vertically. Tapping the toast (anywhere except its action buttons) opens
// the relevant route.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  markRead,
  notificationCopy,
  onFreshNotification,
  type NotificationRow,
} from '@/lib/notifications';
import { acceptFriendRequest, declineFriendRequest } from '@/lib/social';
import { api, friendlyError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const AUTO_DISMISS_MS = 5000;
const MAX_TOASTS = 4;

interface ToastItem {
  notif: NotificationRow;
  ttl: number;
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = onFreshNotification((n) => {
      setToasts((prev) => {
        if (prev.some((t) => t.notif.id === n.id)) return prev;
        const next = [...prev, { notif: n, ttl: Date.now() + AUTO_DISMISS_MS }];
        return next.slice(-MAX_TOASTS);
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const i = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.ttl > now));
    }, 500);
    return () => window.clearInterval(i);
  }, [toasts.length]);

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-end gap-2 px-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4.5rem)' }}
    >
      {toasts.map((t) => (
        <Toast
          key={t.notif.id}
          notif={t.notif}
          onDismiss={() => setToasts((p) => p.filter((x) => x.notif.id !== t.notif.id))}
        />
      ))}
    </div>
  );
}

function Toast({ notif, onDismiss }: { notif: NotificationRow; onDismiss: () => void }) {
  const navigate = useNavigate();
  const copy = notificationCopy(notif);
  const isFriendReq = notif.kind === 'friend_request';
  const isChallenge = notif.kind === 'challenge_request';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = () => {
    void markRead(notif.id);
    if (notif.kind === 'follow' && notif.actor?.username) {
      navigate(`/u/${notif.actor.username}`);
    } else if (notif.kind === 'friend_accept' && notif.actor?.username) {
      navigate(`/u/${notif.actor.username}`);
    } else if (
      notif.kind === 'challenge_request' ||
      notif.kind === 'challenge_accepted' ||
      notif.kind === 'challenge_finished' ||
      notif.kind === 'challenge_declined'
    ) {
      if (notif.challenge_id) navigate(`/challenge?cid=${notif.challenge_id}`);
    } else if (notif.kind === 'friend_request') {
      navigate('/friends');
    }
    onDismiss();
  };

  async function onAcceptFriend() {
    setBusy(true);
    setErr(null);
    try {
      const reqId = (notif.payload?.request_id as string) || '';
      if (reqId) await acceptFriendRequest(reqId);
      void markRead(notif.id);
      onDismiss();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeclineFriend() {
    setBusy(true);
    setErr(null);
    try {
      const reqId = (notif.payload?.request_id as string) || '';
      if (reqId) await declineFriendRequest(reqId);
      void markRead(notif.id);
      onDismiss();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptChallenge() {
    if (!notif.challenge_id) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      await api(`/api/challenges/${encodeURIComponent(notif.challenge_id)}/accept?user_id=${encodeURIComponent(uid)}`, {
        method: 'POST',
      });
      void markRead(notif.id);
      onDismiss();
      navigate(`/challenge?cid=${notif.challenge_id}`);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeclineChallenge() {
    if (!notif.challenge_id) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      await api(`/api/challenges/${encodeURIComponent(notif.challenge_id)}/decline?user_id=${encodeURIComponent(uid)}`, {
        method: 'POST',
      });
      void markRead(notif.id);
      onDismiss();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-soft-lg backdrop-blur"
    >
      <button
        onClick={open}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-surface-container-low"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-tertiary text-base text-on-primary">
          {iconFor(notif.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label-md font-bold text-on-surface">{copy.title}</p>
          {copy.body && <p className="mt-0.5 truncate text-label-sm text-on-surface-variant">{copy.body}</p>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss"
          className="rounded-full px-2 py-0.5 text-label-sm text-on-surface-variant hover:bg-surface-container"
        >
          ✕
        </button>
      </button>

      {(isFriendReq || isChallenge) && (
        <div className="flex items-center gap-1.5 border-t border-outline-variant bg-surface-container-low p-2">
          <button
            onClick={isFriendReq ? onAcceptFriend : onAcceptChallenge}
            disabled={busy}
            className="flex-1 rounded-full bg-primary px-3 py-1.5 text-label-sm font-bold text-on-primary shadow-glow disabled:opacity-50"
          >
            {busy ? '…' : 'Accept'}
          </button>
          <button
            onClick={isFriendReq ? onDeclineFriend : onDeclineChallenge}
            disabled={busy}
            className="flex-1 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
          >
            Decline
          </button>
          {isChallenge && notif.actor?.username && (
            <Link
              to={`/u/${notif.actor.username}`}
              className="rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm text-on-surface hover:bg-surface-container-high"
              onClick={() => onDismiss()}
            >
              View
            </Link>
          )}
        </div>
      )}

      {err && <p className="px-3 pb-2 text-label-sm text-error">{err}</p>}
    </div>
  );
}

function iconFor(kind: NotificationRow['kind']): string {
  switch (kind) {
    case 'follow': return '➕';
    case 'friend_request': return '👥';
    case 'friend_accept': return '🤝';
    case 'challenge_request': return '⚔';
    case 'challenge_accepted': return '✅';
    case 'challenge_declined': return '✗';
    case 'challenge_finished': return '🏁';
    default: return '🔔';
  }
}
