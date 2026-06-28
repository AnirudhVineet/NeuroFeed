import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/social/Avatar';
import {
  deleteComment,
  fetchEngagement,
  likeReel,
  listComments,
  postComment,
  unlikeReel,
  type EngagementSummary,
  type ReelComment,
} from '@/lib/reels';

// Inline engagement for Global Feed reels — no modal, no popup.
// Layout in the consuming reel card:
//   1. <LikeButton> + <CommentToggleButton> live inline in the action row
//      next to send / share, so the user can like in one tap from the feed.
//   2. <ReelCommentsInline> lives below the action row. Collapsed it shows a
//      single "View all N comments" affordance + a quiet "Add a comment"
//      input; expanded it shows the full list, an input, and a collapse link.
//   3. Comments are lazy-loaded on first expand so feed render stays cheap.
//
// State (summary counts + has_liked) lives in `useReelEngagement` so multiple
// surfaces can share it without prop-drilling.

export function useReelEngagement(
  artifactId: string,
  userId: string | null,
  enabled = true,
) {
  const [summary, setSummary] = useState<EngagementSummary | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await fetchEngagement(artifactId, userId);
        if (!cancelled) setSummary(s);
      } catch {
        if (!cancelled) setSummary({ like_count: 0, comment_count: 0, has_liked: false });
      }
    })();
    return () => { cancelled = true; };
  }, [artifactId, userId, enabled]);

  const toggleLike = useCallback(async () => {
    if (!userId || !summary || pending) return;
    const next = !summary.has_liked;
    setSummary({
      ...summary,
      has_liked: next,
      like_count: summary.like_count + (next ? 1 : -1),
    });
    setPending(true);
    try {
      if (next) await likeReel(artifactId, userId);
      else await unlikeReel(artifactId, userId);
    } catch {
      setSummary((curr) =>
        curr
          ? {
              ...curr,
              has_liked: !next,
              like_count: curr.like_count + (next ? -1 : 1),
            }
          : curr,
      );
    } finally {
      setPending(false);
    }
  }, [artifactId, userId, summary, pending]);

  const bumpCommentCount = useCallback((delta: number) => {
    setSummary((curr) =>
      curr ? { ...curr, comment_count: Math.max(0, curr.comment_count + delta) } : curr,
    );
  }, []);

  return { summary, pending, toggleLike, bumpCommentCount };
}

export function LikeButton({
  summary,
  pending,
  disabled,
  onToggle,
}: {
  summary: EngagementSummary | null;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const liked = !!summary?.has_liked;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || pending}
      aria-label={liked ? 'Unlike' : 'Like'}
      aria-pressed={liked}
      className={`inline-flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50 ${
        liked ? 'text-rose-500' : 'text-on-surface-variant hover:text-primary'
      }`}
    >
      <span
        className={`material-symbols-outlined transition-transform ${liked ? 'scale-110' : ''}`}
        style={liked ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        favorite
      </span>
      {summary && summary.like_count > 0 && (
        <span className="text-xs font-semibold tabular-nums">{summary.like_count}</span>
      )}
    </button>
  );
}

export function CommentToggleButton({
  count,
  active,
  onClick,
}: {
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Hide comments' : 'Show comments'}
      aria-expanded={active}
      className={`inline-flex items-center gap-1 transition-colors active:scale-95 ${
        active ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
      }`}
    >
      <span
        className="material-symbols-outlined"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        mode_comment
      </span>
      {count > 0 && (
        <span className="text-xs font-semibold tabular-nums">{count}</span>
      )}
    </button>
  );
}

interface InlineProps {
  artifactId: string;
  userId: string | null;
  /** Controlled expand state — driven by parent so the comment-icon button
   * (in the action row) toggles the same flag. */
  open: boolean;
  commentCount: number;
  onOpen: () => void;
  onCountChange: (delta: number) => void;
}

export function ReelCommentsInline({
  artifactId,
  userId,
  open,
  commentCount,
  onOpen,
  onCountChange,
}: InlineProps) {
  const [comments, setComments] = useState<ReelComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const loadedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Lazy load: only fetch when the section is first opened. Stays cached for
  // the lifetime of the card so subsequent collapses + reopens are instant.
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    void (async () => {
      try {
        const res = await listComments(artifactId);
        setComments(res.items);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, artifactId]);

  async function submit() {
    const body = text.trim();
    if (!body || !userId || posting) return;
    setPosting(true);
    setErr(null);
    try {
      const c = await postComment(artifactId, userId, body);
      setComments((prev) => (prev ? [...prev, c] : [c]));
      onCountChange(+1);
      setText('');
      // Resize the textarea back to one line after a successful post.
      if (inputRef.current) inputRef.current.style.height = 'auto';
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  async function remove(c: ReelComment) {
    if (!userId || c.user_id !== userId) return;
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteComment(c.id, userId);
      setComments((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
      onCountChange(-1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  // Collapsed teaser — shows the count link OR the quiet-add-prompt.
  if (!open) {
    if (commentCount === 0) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className="mt-1 block w-full rounded-lg px-1 py-1 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          Add a comment…
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 block w-full rounded-lg px-1 py-1 text-left text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        {commentCount === 1
          ? 'View 1 comment'
          : `View all ${commentCount} comments`}
      </button>
    );
  }

  const list = comments ?? [];
  const visible = !showAll && list.length > 4 ? list.slice(-3) : list;
  const hiddenCount = list.length - visible.length;

  return (
    <div className="mt-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
      {loading ? (
        <p className="text-center text-xs text-on-surface-variant">Loading comments…</p>
      ) : list.length === 0 ? (
        <p className="px-1 py-2 text-xs text-on-surface-variant">
          No comments yet. Be the first.
        </p>
      ) : (
        <>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mb-2 block text-left text-[11px] font-semibold text-primary hover:underline"
            >
              View {hiddenCount} earlier comment{hiddenCount === 1 ? '' : 's'}
            </button>
          )}
          <ul className="flex flex-col gap-2.5">
            {visible.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                isMine={!!userId && c.user_id === userId}
                onRemove={() => void remove(c)}
              />
            ))}
          </ul>
        </>
      )}

      {userId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-3 flex items-end gap-2 border-t border-outline-variant pt-3"
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // Auto-grow up to 4 lines.
              if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = `${Math.min(96, inputRef.current.scrollHeight)}px`;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder="Add a comment…"
            className="max-h-24 flex-1 resize-none rounded-2xl border border-outline-variant bg-surface-container px-3 py-1.5 text-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
          />
          <button
            type="submit"
            disabled={!text.trim() || posting}
            className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary-container disabled:opacity-40"
          >
            {posting ? (
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '18px' }}>
                progress_activity
              </span>
            ) : (
              'Post'
            )}
          </button>
        </form>
      ) : (
        <p className="mt-3 border-t border-outline-variant pt-3 text-center text-xs text-on-surface-variant">
          Sign in to add a comment.
        </p>
      )}

      {err && <p className="mt-2 text-center text-[11px] text-error">{err}</p>}
    </div>
  );
}

function CommentRow({
  comment,
  isMine,
  onRemove,
}: {
  comment: ReelComment;
  isMine: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-start gap-2">
      <Avatar
        seed={comment.author.avatar_seed}
        size={28}
        username={comment.author.username}
        label={comment.author.display_name}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-on-surface">
            {comment.author.display_name}
          </span>
          <span className="shrink-0 text-[10px] text-on-surface-variant tabular-nums">
            {formatTime(comment.created_at)}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-on-surface">
          {comment.body}
        </p>
      </div>
      {isMine && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete comment"
          className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
        </button>
      )}
    </li>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
