import { Link } from 'react-router-dom';
import type { LearningPathStep } from '../../../../../packages/shared-types/artifacts';

// Reel-sized renderer for a single learning_path_step artifact in the main
// scroll-snap feed. Was previously falling through to the "(no renderer yet)"
// debug fallback. Keeps the same visual cadence as SwipeCard / FlashcardCard
// (full-bleed dark surface, large hero text, primary CTA at the bottom).

interface Props {
  data: LearningPathStep;
  documentId: string | null | undefined;
  documentTitle?: string | null;
}

export function PathStepCard({ data, documentId, documentTitle }: Props) {
  const goalLines = splitGoal(data.goal);
  const docHref = documentId ? `/doc/${encodeURIComponent(documentId)}` : '/paths';
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-primary/25 via-secondary/15 to-accent/25">
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-gradient opacity-30 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />

      <div className="relative flex h-full w-full flex-col px-6 pt-24 pb-32">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-glow">
            Learning Path
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/85">
            Step {data.order}
          </span>
        </div>

        {documentTitle && (
          <p className="mt-3 line-clamp-1 text-[11px] uppercase tracking-widest text-white/55">
            {documentTitle}
          </p>
        )}

        <div className="mt-6 flex flex-1 flex-col justify-center">
          <p className="text-[10px] uppercase tracking-[0.32em] text-white/55">Your goal</p>
          <h2 className="mt-3 text-balance text-3xl font-bold leading-tight text-white sm:text-4xl">
            {goalLines.headline}
          </h2>
          {goalLines.body && (
            <p className="mt-4 max-w-prose text-balance text-base leading-relaxed text-white/85">
              {goalLines.body}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Chip>~{estMinutes(data)} min</Chip>
            <Chip>{xpForStep(data)} XP</Chip>
            <Chip>Concept · {data.concept_id.slice(0, 6)}</Chip>
          </div>
        </div>

        <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2">
          <Link
            to={documentId ? `${docHref}#path` : '/paths'}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-3 text-sm font-bold text-white shadow-glow transition-transform hover:scale-[1.02] active:scale-95"
          >
            Open in Learning Path →
          </Link>
          <Link
            to={`/tutor?doc=${encodeURIComponent(documentId ?? '')}&concept=${encodeURIComponent(data.concept_id)}`}
            className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
          >
            Ask tutor
          </Link>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-white/85">
      {children}
    </span>
  );
}

// Goals are often a single long sentence. Split into a leading clause +
// remainder so the visual hierarchy mirrors a hook + supporting line.
function splitGoal(goal: string): { headline: string; body: string } {
  const cleaned = (goal ?? '').trim();
  if (!cleaned) return { headline: 'Master this step', body: '' };
  const sentenceEnd = cleaned.search(/[.!?]\s/);
  if (sentenceEnd > 24 && sentenceEnd < 120) {
    return {
      headline: cleaned.slice(0, sentenceEnd + 1),
      body: cleaned.slice(sentenceEnd + 1).trim(),
    };
  }
  if (cleaned.length > 140) {
    return {
      headline: cleaned.slice(0, 100).trim() + '…',
      body: cleaned.slice(100).trim(),
    };
  }
  return { headline: cleaned, body: '' };
}

function estMinutes(step: LearningPathStep): number {
  const difficulty = (step.order % 3) + 1;
  return 6 + (step.goal.length % 8) + difficulty * 3;
}

function xpForStep(step: LearningPathStep): number {
  const difficulty = (step.order % 3) + 1;
  return 30 + difficulty * 20;
}
