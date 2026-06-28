import { useState } from 'react';
import { inferSubject } from '@/lib/subjects';
import { ReelCard } from './ReelCard';
import {
  CommentToggleButton,
  LikeButton,
  ReelCommentsInline,
  useReelEngagement,
} from './ReelEngagement';
import { ShareReelSheet } from '@/components/messages/ShareReelSheet';
import type { ReelScript } from '../../../../../packages/shared-types/artifacts';

// 4:5 Instagram-style card representing one reel in the home feed. The reel
// auto-plays inline once it scrolls into view (>=60% intersection) via the
// embedded ReelCard's IntersectionObserver — no click required. The
// "Watch" footer button still opens the fullscreen overlay for the full UX.
// When the overlay is open for this same reel, the inline ReelCard is
// unmounted so audio doesn't double-play.

export interface ReelFeedCardProps {
  reel: ReelScript;
  documentTitle?: string;
  artifactId: string;
  documentId?: string;
  conceptId?: string | null;
  userId?: string | null;
  isOpenedInOverlay?: boolean;
  /** When 'global', renders the public like/comment engagement bar.
   * On 'mine', those buttons are hidden — likes/comments are an audience
   * signal, not a personal-feed signal. */
  scope?: 'mine' | 'global';
  onOpen: () => void;
  onQuickLearning?: () => void;
}

export function ReelFeedCard({
  reel,
  documentTitle,
  artifactId,
  documentId,
  conceptId,
  userId,
  isOpenedInOverlay = false,
  scope = 'mine',
  onOpen,
  onQuickLearning,
}: ReelFeedCardProps) {
  const subject = inferSubject(reel.topic || reel.title || documentTitle);
  const hue = hashHue(`${reel.topic}|${reel.title}`);
  const [bookmarked, setBookmarked] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Engagement is only meaningful on Global Feed — skip the fetch on My Feed.
  const isGlobal = scope === 'global';
  const engagement = useReelEngagement(artifactId, userId ?? null, isGlobal);

  return (
    <article className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-card">
      <header className="flex items-center justify-between p-md">
        <div className="flex items-center gap-sm">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-primary"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 80) % 360} 65% 50%))`,
            }}
            aria-hidden
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              psychology
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-label-md text-on-surface">
              {documentTitle || 'NeuroFeed'}
            </h3>
            <p className="truncate text-[12px] text-on-surface-variant">
              {reel.title || reel.topic}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-surface-container px-3 py-1 text-label-sm text-on-surface-variant">
          {subject}
        </span>
      </header>

      {/* Inline reel player. Auto-plays once 60%+ visible. While the same
          reel is open in the fullscreen overlay we drop this instance so a
          second <audio> isn't speaking over the overlay. */}
      <div
        className="relative aspect-[4/5] w-full overflow-hidden bg-black"
        style={{
          background: `radial-gradient(120% 80% at 20% 10%, hsl(${hue} 65% 35%) 0%, transparent 60%), radial-gradient(120% 80% at 80% 90%, hsl(${(hue + 80) % 360} 65% 35%) 0%, transparent 60%), linear-gradient(160deg, #0a0e18 0%, #03050a 100%)`,
        }}
      >
        {isOpenedInOverlay ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            <span className="text-label-sm uppercase tracking-widest">Playing fullscreen</span>
          </div>
        ) : (
          <ReelCard
            data={reel}
            documentId={documentId}
            conceptId={conceptId}
            artifactId={artifactId}
            userId={userId}
            embedded
          />
        )}
      </div>

      <div className="p-md">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-md text-on-surface-variant">
            {isGlobal && (
              <>
                <LikeButton
                  summary={engagement.summary}
                  pending={engagement.pending}
                  disabled={!userId}
                  onToggle={() => void engagement.toggleLike()}
                />
                <CommentToggleButton
                  count={engagement.summary?.comment_count ?? 0}
                  active={commentsOpen}
                  onClick={() => setCommentsOpen((v) => !v)}
                />
              </>
            )}
            <ActionButton
              icon="forward_to_inbox"
              onClick={() => setShareOpen(true)}
              label="Send to friend"
            />
            <ActionButton
              icon="ios_share"
              onClick={async () => {
                const url = window.location.origin;
                const title = reel.title || reel.topic;
                if (navigator.share) {
                  try { await navigator.share({ title, text: `${title} — NeuroFeed`, url }); } catch { /* user cancelled */ }
                } else {
                  await navigator.clipboard.writeText(url);
                }
              }}
              label="Share link"
            />
          </div>
          <ActionButton
            icon="bookmark"
            filled={bookmarked}
            activeColor="text-primary"
            onClick={() => setBookmarked((v) => !v)}
            label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          />
        </div>

        {isGlobal && (
          <ReelCommentsInline
            artifactId={artifactId}
            userId={userId ?? null}
            open={commentsOpen}
            commentCount={engagement.summary?.comment_count ?? 0}
            onOpen={() => setCommentsOpen(true)}
            onCountChange={engagement.bumpCommentCount}
          />
        )}

        <div className="mt-md" />

        <div className="grid grid-cols-2 gap-sm">
          <button
            type="button"
            onClick={onQuickLearning}
            className="flex items-center justify-center gap-xs rounded-lg bg-primary-container py-sm text-label-md font-bold text-on-primary-container transition-all hover:brightness-95 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>quiz</span>
            Quiz Me
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center justify-center gap-xs rounded-lg border border-outline-variant py-sm text-label-md font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span>
            Watch
          </button>
        </div>
      </div>

      <ShareReelSheet
        open={shareOpen}
        artifactId={artifactId}
        reelTitle={reel.title || reel.topic}
        userId={userId ?? null}
        onClose={() => setShareOpen(false)}
      />
    </article>
  );
}

function ActionButton({
  icon,
  filled,
  activeColor,
  onClick,
  label,
}: {
  icon: string;
  filled?: boolean;
  activeColor?: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        filled && activeColor
          ? `flex items-center justify-center transition-transform active:scale-90 ${activeColor}`
          : 'flex items-center justify-center text-on-surface-variant transition-colors hover:text-primary active:scale-90'
      }
    >
      <span
        className="material-symbols-outlined"
        style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
    </button>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
