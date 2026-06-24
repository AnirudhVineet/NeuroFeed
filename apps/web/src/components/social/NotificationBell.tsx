import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  markAllRead,
  markRead,
  notificationCopy,
  useNotifications,
  type NotificationRow,
} from '@/lib/notifications';

export function NotificationBell() {
  const { items, unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/85 hover:bg-white/10"
      >
        <span aria-hidden className="text-base">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-white/15 bg-card/95 shadow-soft-lg backdrop-blur">
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/65">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-[10px] text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </header>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-6 text-center text-xs text-white/55">No notifications yet.</li>
            ) : (
              items.slice(0, 30).map((n) => <NotifRow key={n.id} n={n} onPick={() => setOpen(false)} />)
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, onPick }: { n: NotificationRow; onPick: () => void }) {
  const navigate = useNavigate();
  const copy = notificationCopy(n);

  function open() {
    void markRead(n.id);
    if (n.kind === 'follow' || n.kind === 'friend_accept') {
      if (n.actor?.username) navigate(`/u/${n.actor.username}`);
    } else if (n.kind === 'friend_request') {
      navigate('/friends');
    } else if (n.challenge_id) {
      navigate(`/challenge?cid=${n.challenge_id}`);
    }
    onPick();
  }

  return (
    <li
      onClick={open}
      className={`flex cursor-pointer items-start gap-2.5 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0 hover:bg-white/[0.04] ${
        n.read ? '' : 'bg-primary/[0.05]'
      }`}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-accent text-xs">
        {iconFor(n.kind)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{copy.title}</p>
        {copy.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-white/60">{copy.body}</p>}
        <p className="mt-0.5 text-[10px] text-white/40">{relTime(n.created_at)}</p>
      </div>
      {n.actor?.username && (
        <Link
          to={`/u/${n.actor.username}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 self-center text-[10px] text-primary/85 hover:text-primary"
        >
          View
        </Link>
      )}
      {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
    </li>
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
