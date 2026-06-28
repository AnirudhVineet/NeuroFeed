import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { useSocial } from '@/lib/social';
import { openConversation, shareReelMessage } from '@/lib/messages';

// Bottom-sheet for sending a reel to a friend. Shows the user's friend list
// (from the social store), supports a quick search, and on tap:
//   1. opens or creates the 1:1 conversation
//   2. inserts a reel_share message pointing at the artifact id
//   3. navigates to /messages?conv=<id>
// Friends are required — the message API rejects sends to non-friends.

export interface ShareReelSheetProps {
  open: boolean;
  artifactId: string | null;
  reelTitle?: string;
  userId: string | null;
  onClose: () => void;
}

export function ShareReelSheet({
  open,
  artifactId,
  reelTitle,
  userId,
  onClose,
}: ShareReelSheetProps) {
  const friends = useSocial().friends;
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setErr(null);
      setBusyId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyId) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busyId, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        (f.username ?? '').toLowerCase().includes(q) ||
        (f.display_name ?? '').toLowerCase().includes(q),
    );
  }, [friends, query]);

  if (!open) return null;

  async function shareTo(peerId: string) {
    if (!artifactId || !userId) return;
    setBusyId(peerId);
    setErr(null);
    try {
      const { id: convId } = await openConversation(userId, peerId);
      await shareReelMessage(convId, userId, artifactId);
      onClose();
      navigate(`/messages?conv=${encodeURIComponent(convId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share reel with a friend"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !busyId && onClose()}
    >
      <div
        className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-outline-variant bg-surface-container-lowest shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-outline-variant px-5 py-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-surface-container-high sm:hidden" />
          <h2 className="text-base font-semibold text-on-surface">Send to a friend</h2>
          {reelTitle && (
            <p className="mt-0.5 line-clamp-1 text-xs text-on-surface-variant">
              {reelTitle}
            </p>
          )}
        </div>

        <div className="shrink-0 px-4 py-3">
          <div className="relative">
            <span
              className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
              style={{ fontSize: '18px' }}
              aria-hidden
            >
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends…"
              className="w-full rounded-full border border-outline-variant bg-surface-container py-2 pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {friends.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-on-surface-variant">
              You don't have any friends yet. Add some from <span className="font-semibold">/friends</span> to start sharing.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-on-surface-variant">
              No friends match "{query}".
            </p>
          ) : (
            <ul>
              {filtered.map((f) => {
                const busy = busyId === f.user_id;
                return (
                  <li key={f.user_id}>
                    <button
                      type="button"
                      onClick={() => shareTo(f.user_id)}
                      disabled={!!busyId}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-container disabled:opacity-50"
                    >
                      <Avatar
                        seed={f.avatar_seed ?? f.user_id}
                        size={36}
                        username={f.username}
                        label={f.display_name}
                        linkTo={false}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {f.display_name || f.username}
                        </p>
                        <p className="truncate text-[11px] text-on-surface-variant">
                          @{f.username}
                        </p>
                      </div>
                      <span
                        className={`material-symbols-outlined shrink-0 ${
                          busy ? 'animate-spin text-primary' : 'text-on-surface-variant'
                        }`}
                        style={{ fontSize: '20px' }}
                        aria-hidden
                      >
                        {busy ? 'progress_activity' : 'send'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {err && (
          <p className="shrink-0 px-4 pb-2 text-center text-[11px] text-error">{err}</p>
        )}

        <div className="shrink-0 border-t border-outline-variant bg-surface-container px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyId}
            className="w-full rounded-full border border-outline-variant bg-surface-container-high py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
