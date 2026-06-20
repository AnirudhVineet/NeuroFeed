import { useState } from 'react';
import { postInterest, type InterestKind } from '@/lib/feed';

export interface InterestTarget {
  artifactId?: string;
  documentId?: string | null;
  conceptId?: string | null;
}

// Replaces the old like/save UI. Records a "more like this" or "less like this"
// signal that the feed ranker reads to bias future recommendations.
export function InterestButtons({
  userId,
  target,
  variant = 'rail',
}: {
  userId: string | null;
  target: InterestTarget;
  variant?: 'rail' | 'inline';
}) {
  const [choice, setChoice] = useState<InterestKind | null>(null);
  const [pending, setPending] = useState(false);

  async function send(kind: InterestKind) {
    if (!userId || pending) return;
    // Toggling the same choice clears it client-side, but server-side we keep
    // the audit trail by also recording the opposite signal once.
    const next = choice === kind ? null : kind;
    setChoice(next);
    setPending(true);
    try {
      if (next) {
        await postInterest(userId, next, {
          artifact_id: target.artifactId,
          document_id: target.documentId,
          concept_id: target.conceptId,
        });
      }
    } catch {
      // Best-effort — revert the optimistic choice on failure.
      setChoice((c) => (c === next ? null : c));
    } finally {
      setPending(false);
    }
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <InlineBtn
          active={choice === 'interested'}
          onClick={() => send('interested')}
          tone="positive"
          label="Interested"
        />
        <InlineBtn
          active={choice === 'not_interested'}
          onClick={() => send('not_interested')}
          tone="negative"
          label="Not for me"
        />
      </div>
    );
  }

  return (
    <>
      <RailBtn
        active={choice === 'interested'}
        tone="positive"
        title="More like this"
        onClick={() => send('interested')}
        glyph="✦"
      />
      <RailBtn
        active={choice === 'not_interested'}
        tone="negative"
        title="Not interested"
        onClick={() => send('not_interested')}
        glyph="✕"
      />
    </>
  );
}

function RailBtn({
  active, tone, title, onClick, glyph,
}: {
  active: boolean;
  tone: 'positive' | 'negative';
  title: string;
  onClick: () => void;
  glyph: string;
}) {
  const accent = active
    ? tone === 'positive'
      ? 'border-emerald-400/60 bg-emerald-500/30 text-white'
      : 'border-rose-400/60 bg-rose-500/30 text-white'
    : 'border-white/15 bg-black/45 text-white hover:bg-black/60';
  return (
    <button
      title={title}
      data-action
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`h-11 w-11 rounded-full border text-xl leading-none backdrop-blur transition-colors ${accent}`}
      aria-pressed={active}
    >
      {glyph}
    </button>
  );
}

function InlineBtn({
  active, tone, label, onClick,
}: {
  active: boolean;
  tone: 'positive' | 'negative';
  label: string;
  onClick: () => void;
}) {
  const accent = active
    ? tone === 'positive'
      ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
      : 'border-rose-400/60 bg-rose-500/25 text-rose-100'
    : 'border-white/15 bg-black/40 text-white/85 hover:bg-black/55';
  return (
    <button
      data-action
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors ${accent}`}
      aria-pressed={active}
    >
      <span aria-hidden>{tone === 'positive' ? '✦' : '✕'}</span>
      <span>{label}</span>
    </button>
  );
}
