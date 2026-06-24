import { useState } from 'react';
import { inferSubject } from '@/lib/subjects';
import { postInterest } from '@/lib/feed';
import type { ReelScript } from '../../../../../packages/shared-types/artifacts';

// 4:5 Instagram-style card representing one reel in the home feed. Tapping
// the thumbnail (or the play button) opens the existing ReelCard engine
// fullscreen via the ReelOverlay. The card itself never plays audio.

export interface ReelFeedCardProps {
  reel: ReelScript;
  documentTitle?: string;
  artifactId: string;
  documentId?: string;
  conceptId?: string | null;
  userId?: string | null;
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
  onOpen,
  onQuickLearning,
}: ReelFeedCardProps) {
  const subject = inferSubject(reel.topic || reel.title || documentTitle);
  const hue = hashHue(`${reel.topic}|${reel.title}`);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const partLabel =
    reel.part_index && reel.part_total && reel.part_total > 1
      ? `Part ${reel.part_index}/${reel.part_total}`
      : null;

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

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play reel: ${reel.title || reel.topic}`}
        className="group relative block aspect-[4/5] w-full overflow-hidden bg-surface-dim"
        style={{
          background: `radial-gradient(120% 80% at 20% 10%, hsl(${hue} 65% 35%) 0%, transparent 60%), radial-gradient(120% 80% at 80% 90%, hsl(${(hue + 80) % 360} 65% 35%) 0%, transparent 60%), linear-gradient(160deg, #0a0e18 0%, #03050a 100%)`,
        }}
      >
        {/* Subject + part chip */}
        <div className="absolute left-md top-md flex items-center gap-2">
          <span className="glass rounded-full px-3 py-1 text-label-sm text-on-surface">
            #{subject}
          </span>
          {partLabel && (
            <span className="rounded-full bg-tertiary-fixed/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-tertiary-fixed">
              {partLabel}
            </span>
          )}
        </div>

        {/* Title overlay */}
        <div className="absolute inset-x-md bottom-md text-white">
          <h2 className="line-clamp-3 text-headline-sm font-bold drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
            {reel.title || reel.topic}
          </h2>
        </div>

        {/* Center play button — visible always, more prominent on hover */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity">
          <span
            className="material-symbols-outlined text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.7)] transition-transform group-hover:scale-110 group-active:scale-95"
            style={{ fontSize: '72px', fontVariationSettings: "'FILL' 1" }}
          >
            play_circle
          </span>
        </div>
      </button>

      <div className="p-md">
        <div className="mb-md flex items-center justify-between">
          <div className="flex items-center gap-md text-on-surface-variant">
            <ActionButton
              icon="favorite"
              filled={liked}
              activeColor="text-error"
              onClick={() => {
                setLiked((v) => !v);
                if (userId && !liked) {
                  void postInterest(userId, 'interested', { artifact_id: artifactId, document_id: documentId, concept_id: conceptId });
                }
              }}
              label={liked ? 'Unlike' : 'Like'}
            />
            <ActionButton icon="chat_bubble" onClick={onOpen} label="Open" />
            <ActionButton
              icon="send"
              onClick={async () => {
                const url = window.location.origin;
                const title = reel.title || reel.topic;
                if (navigator.share) {
                  try { await navigator.share({ title, text: `${title} — NeuroFeed`, url }); } catch { /* user cancelled */ }
                } else {
                  await navigator.clipboard.writeText(url);
                }
              }}
              label="Share"
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
