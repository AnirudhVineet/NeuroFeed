import { useEffect } from 'react';
import { ReelCard } from './ReelCard';
import type { ReelScript } from '../../../../../packages/shared-types/artifacts';

// Fullscreen modal that hosts the existing ReelCard engine. The home feed's
// 4:5 thumbnail cards open into this overlay — preserving the full reel
// experience (visual beats, karaoke captions, tutor panel, speed control)
// while keeping the feed itself scrollable as a normal list.

export interface ReelOverlayProps {
  reel: ReelScript;
  documentId?: string;
  conceptId?: string | null;
  artifactId?: string;
  userId?: string | null;
  onComplete?: () => void;
  onClose: () => void;
}

export function ReelOverlay({
  reel,
  documentId,
  conceptId,
  artifactId,
  userId,
  onComplete,
  onClose,
}: ReelOverlayProps) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reel player"
      data-modal-root
      className="fixed inset-0 z-50 bg-black"
    >
      <div className="relative h-full w-full">
        <ReelCard
          data={reel}
          documentId={documentId}
          conceptId={conceptId}
          artifactId={artifactId}
          userId={userId}
          onComplete={onComplete}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reel"
          className="absolute right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  );
}
