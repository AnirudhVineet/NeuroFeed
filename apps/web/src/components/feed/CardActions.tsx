import { useState } from 'react';

export interface ActionHandlers {
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onExplainSimpler: () => Promise<void> | void;
  onQuizMe?: () => void;
}

export function CardActions({ onLike, onSave, onShare, onExplainSimpler, onQuizMe }: ActionHandlers) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
      <IconBtn
        label={liked ? '♥' : '♡'}
        accent={liked}
        onClick={() => { setLiked(true); onLike(); }}
      />
      <IconBtn
        label={saved ? '★' : '☆'}
        accent={saved}
        onClick={() => { setSaved(true); onSave(); }}
      />
      <IconBtn label="↗" onClick={onShare} />
      <IconBtn
        label={busy ? '…' : '↓'}
        title="Explain simpler"
        onClick={async () => {
          setBusy(true);
          try { await onExplainSimpler(); } finally { setBusy(false); }
        }}
      />
      {onQuizMe && <IconBtn label="?" title="Quiz me" onClick={onQuizMe} />}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  accent,
  title,
}: { label: string; onClick: () => void; accent?: boolean; title?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`h-12 w-12 rounded-full bg-black/40 backdrop-blur border border-white/15 text-2xl leading-none ${
        accent ? 'text-accent' : 'text-white'
      }`}
    >
      {label}
    </button>
  );
}
