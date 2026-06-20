import { useState } from 'react';
import { InterestButtons, type InterestTarget } from './InterestButtons';
import { TutorPanel, type TutorContext } from './TutorPanel';

export interface ActionHandlers {
  onShare: () => void;
  tutorContext: TutorContext;
  userId?: string | null;
  interestTarget?: InterestTarget;
}

// Side rail used by non-reel cards (swipe, flashcard, quiz). Share +
// Ask AI Doubt + Interested / Not Interested.
export function CardActions({
  onShare,
  tutorContext,
  userId,
  interestTarget,
}: ActionHandlers) {
  const [askOpen, setAskOpen] = useState(false);

  return (
    <>
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-3">
        {interestTarget && (
          <InterestButtons userId={userId ?? null} target={interestTarget} />
        )}
        <IconBtn label="↗" onClick={onShare} title="Share" />
        <IconBtn label="?" title="Ask AI Doubt" onClick={() => setAskOpen(true)} />
      </div>
      <TutorPanel open={askOpen} ctx={tutorContext} onClose={() => setAskOpen(false)} />
    </>
  );
}

function IconBtn({
  label,
  onClick,
  title,
}: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      title={title}
      data-action
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="h-11 w-11 rounded-full border border-white/15 bg-black/45 text-xl leading-none text-white backdrop-blur hover:bg-black/60"
    >
      {label}
    </button>
  );
}
