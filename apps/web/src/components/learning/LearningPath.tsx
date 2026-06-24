import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LearningPathStep } from '../../../../../packages/shared-types/artifacts';
import { getPathProgress, setPathProgress, pushActivity } from '@/lib/social';

// One step per artifact row. The backend stores ordered steps that point at
// concept_ids; we enrich locally with mastery (% → progress) and concept
// names. Reads its progress from the local social store so completion
// survives reloads — the source of truth is the user's actions (quiz answers,
// reels watched), but the local store gives an instant on-card state.

export interface ConceptIndex {
  [conceptId: string]: { name: string; mastery: number };
}

export type ViewMode = 'roadmap' | 'tree' | 'timeline' | 'progress';

export interface LearningPathProps {
  docId: string;
  docTitle: string;
  steps: { id: string; payload: LearningPathStep }[];
  conceptIndex: ConceptIndex;
  onOpenReel: () => void;
  onOpenStory: () => void;
  onOpenQuiz: () => void;
  onOpenFlashcards: () => void;
  onOpenTutor: () => void;
  onGenerateNotes: (step: LearningPathStep) => void;
}

interface StepView {
  id: string;
  step: LearningPathStep;
  conceptName: string;
  mastery: number; // 0..1
  difficulty: 1 | 2 | 3;
  estMinutes: number;
  xp: number;
  prereqOrders: number[];
  state: 'locked' | 'not_started' | 'in_progress' | 'completed';
  pct: number;
}

const VIEWS: { id: ViewMode; label: string; glyph: string }[] = [
  { id: 'roadmap', label: 'Roadmap', glyph: '🗺' },
  { id: 'tree', label: 'Tree', glyph: '🌳' },
  { id: 'timeline', label: 'Timeline', glyph: '🧭' },
  { id: 'progress', label: 'Progress', glyph: '📈' },
];

export function LearningPath(props: LearningPathProps) {
  const [view, setView] = useState<ViewMode>('roadmap');
  const [activeId, setActiveId] = useState<string | null>(null);

  const ordered = useMemo(
    () => props.steps.slice().sort((a, b) => a.payload.order - b.payload.order),
    [props.steps],
  );

  const stepViews: StepView[] = useMemo(() => {
    let prevCompleted = true;
    return ordered.map((row, idx) => {
      const s = row.payload;
      const concept = props.conceptIndex[s.concept_id];
      const mastery = concept?.mastery ?? 0;
      const stored = getPathProgress(props.docId, s.order);
      // Effective progress = max(stored local pct, mastery-derived pct)
      const masteryPct = Math.round(mastery * 100);
      const pct = Math.max(stored.pct, masteryPct);
      const completed = stored.status === 'completed' || pct >= 90;
      const inProgress = !completed && (stored.status === 'in_progress' || pct > 0);
      const locked = !prevCompleted && !completed && !inProgress && idx > 0;

      const state: StepView['state'] = locked
        ? 'locked'
        : completed
          ? 'completed'
          : inProgress
            ? 'in_progress'
            : 'not_started';

      const difficulty = ((s.order % 3) + 1) as 1 | 2 | 3;
      const estMinutes = 6 + (s.goal.length % 8) + difficulty * 3;
      const xp = 30 + difficulty * 20;
      const prereqOrders = idx === 0 ? [] : [ordered[idx - 1].payload.order];

      const view: StepView = {
        id: row.id,
        step: s,
        conceptName: concept?.name ?? s.concept_id.slice(0, 6),
        mastery,
        difficulty,
        estMinutes,
        xp,
        prereqOrders,
        state,
        pct,
      };
      prevCompleted = completed;
      return view;
    });
  }, [ordered, props.conceptIndex, props.docId]);

  const completedCount = stepViews.filter((s) => s.state === 'completed').length;
  const overallPct = stepViews.length
    ? Math.round((completedCount / stepViews.length) * 100)
    : 0;

  if (!stepViews.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/55">
        No learning path generated for this document yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PathHeader
        title={props.docTitle}
        total={stepViews.length}
        completed={completedCount}
        pct={overallPct}
      />

      <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === v.id
                ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span aria-hidden>{v.glyph}</span>
            <span>{v.label}</span>
          </button>
        ))}
      </div>

      {view === 'roadmap' && (
        <RoadmapView steps={stepViews} active={activeId} onActivate={setActiveId} actions={props} />
      )}
      {view === 'tree' && (
        <TreeView steps={stepViews} active={activeId} onActivate={setActiveId} actions={props} />
      )}
      {view === 'timeline' && (
        <TimelineView steps={stepViews} active={activeId} onActivate={setActiveId} actions={props} />
      )}
      {view === 'progress' && <ProgressView steps={stepViews} />}
    </div>
  );
}

function PathHeader({
  title,
  total,
  completed,
  pct,
}: {
  title: string;
  total: number;
  completed: number;
  pct: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/15 via-secondary/10 to-accent/15 p-5 shadow-soft">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gradient opacity-25 blur-3xl" />
      <p className="text-[10px] uppercase tracking-widest text-white/55">Learning Path</p>
      <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <PathRing pct={pct} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/70">
            <span className="font-semibold text-white">{completed}</span> of {total} steps completed
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-primary via-secondary to-accent shadow-glow"
              style={{ width: `${pct}%`, transition: 'width 360ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          </div>
          <p className="mt-2 text-[11px] text-white/55">
            Steps unlock as you complete the previous one. Quiz answers feed into mastery; reels and
            flashcards build the on-card progress.
          </p>
        </div>
      </div>
    </div>
  );
}

function PathRing({ pct }: { pct: number }) {
  const R = 24;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width={64} height={64} viewBox="0 0 64 64" className="-rotate-90">
        <circle cx={32} cy={32} r={R} stroke="rgba(255,255,255,0.10)" strokeWidth="4" fill="none" />
        <defs>
          <linearGradient id="path-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
        <circle
          cx={32}
          cy={32}
          r={R}
          stroke="url(#path-ring)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-white">
        {pct}%
      </span>
    </div>
  );
}

// ---- Views ----

function RoadmapView({
  steps,
  active,
  onActivate,
  actions,
}: {
  steps: StepView[];
  active: string | null;
  onActivate: (id: string | null) => void;
  actions: LearningPathProps;
}) {
  return (
    <ol className="relative space-y-3 pl-7">
      <span
        aria-hidden
        className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-primary/50 via-white/15 to-transparent"
      />
      {steps.map((s) => (
        <li key={s.id} className="relative">
          <Connector state={s.state} />
          <StepCard
            sv={s}
            expanded={active === s.id}
            onToggle={() => onActivate(active === s.id ? null : s.id)}
            actions={actions}
          />
        </li>
      ))}
    </ol>
  );
}

function Connector({ state }: { state: StepView['state'] }) {
  const tone =
    state === 'completed'
      ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_10px_2px_rgba(52,211,153,0.45)]'
      : state === 'in_progress'
        ? 'bg-primary border-white shadow-[0_0_10px_2px_rgba(139,92,246,0.45)] animate-pulse-soft'
        : state === 'locked'
          ? 'bg-white/15 border-white/25'
          : 'bg-white/30 border-white/40';
  return (
    <span
      aria-hidden
      className={`absolute -left-[1.05rem] top-3 inline-flex h-3 w-3 rounded-full border-2 ${tone}`}
    />
  );
}

function TreeView({
  steps,
  active,
  onActivate,
  actions,
}: {
  steps: StepView[];
  active: string | null;
  onActivate: (id: string | null) => void;
  actions: LearningPathProps;
}) {
  // Pair steps into a zig-zag so it feels like a Duolingo tree.
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const side = i % 2 === 0 ? 'justify-start' : 'justify-end';
        return (
          <div key={s.id} className={`flex ${side}`}>
            <div className="w-full sm:w-[88%]">
              <StepCard
                sv={s}
                expanded={active === s.id}
                onToggle={() => onActivate(active === s.id ? null : s.id)}
                actions={actions}
                compact
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({
  steps,
  active,
  onActivate,
  actions,
}: {
  steps: StepView[];
  active: string | null;
  onActivate: (id: string | null) => void;
  actions: LearningPathProps;
}) {
  return (
    <div className="relative overflow-x-auto pb-4">
      <div className="flex min-w-full items-stretch gap-3">
        {steps.map((s, i) => (
          <div key={s.id} className="flex w-[260px] shrink-0 flex-col">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/55">
              <span>T+{i * 12}m</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="mt-1.5 flex-1">
              <StepCard
                sv={s}
                expanded={active === s.id}
                onToggle={() => onActivate(active === s.id ? null : s.id)}
                actions={actions}
                compact
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressView({ steps }: { steps: StepView[] }) {
  return (
    <ul className="space-y-2">
      {steps.map((s) => (
        <li key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/45">Step {s.step.order}</p>
              <p className="truncate text-sm font-semibold text-white">{s.conceptName}</p>
            </div>
            <StateChip state={s.state} />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full" style={{ width: `${s.pct}%`, background: barColor(s.pct) }} />
          </div>
          <p className="mt-1 text-[10px] text-white/55">
            Mastery {Math.round(s.mastery * 100)}% · {s.pct}% on-card · {s.xp} XP
          </p>
        </li>
      ))}
    </ul>
  );
}

// ---- Step card ----

function StepCard({
  sv,
  expanded,
  onToggle,
  actions,
  compact,
}: {
  sv: StepView;
  expanded: boolean;
  onToggle: () => void;
  actions: LearningPathProps;
  compact?: boolean;
}) {
  const { step } = sv;
  const locked = sv.state === 'locked';
  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border p-4 shadow-soft transition-all ${
        sv.state === 'completed'
          ? 'border-emerald-400/30 bg-emerald-500/[0.06]'
          : sv.state === 'in_progress'
            ? 'border-primary/40 bg-primary/[0.08]'
            : locked
              ? 'border-white/10 bg-white/[0.02] opacity-70'
              : 'border-white/10 bg-white/[0.04] hover:border-primary/30'
      }`}
    >
      <header className="flex items-start gap-3">
        <StepBadge order={step.order} state={sv.state} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <DifficultyDots level={sv.difficulty} />
            <span className="text-[10px] uppercase tracking-widest text-white/55">
              ~{sv.estMinutes}m · {sv.xp} XP
            </span>
            <StateChip state={sv.state} />
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-white">{sv.conceptName}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-white/70">{step.goal}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full" style={{ width: `${sv.pct}%`, background: barColor(sv.pct) }} />
          </div>
        </div>
      </header>

      {sv.prereqOrders.length > 0 && (
        <p className="mt-2 text-[10px] text-white/45">
          Prereq: Step {sv.prereqOrders.join(', ')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ActionButton
          label={sv.state === 'completed' ? 'Review' : sv.state === 'in_progress' ? 'Continue' : 'Start'}
          primary
          disabled={locked}
          onClick={() => {
            if (locked) return;
            setPathProgress(actions.docId, step.order, {
              status: 'in_progress',
              pct: Math.max(15, sv.pct),
            });
            actions.onOpenReel();
          }}
        />
        <ActionButton label="Story" disabled={locked} onClick={() => !locked && actions.onOpenStory()} />
        <ActionButton label="Quiz" disabled={locked} onClick={() => !locked && actions.onOpenQuiz()} />
        <ActionButton label="Flashcards" disabled={locked} onClick={() => !locked && actions.onOpenFlashcards()} />
        <ActionButton label="Tutor" disabled={locked} onClick={() => !locked && actions.onOpenTutor()} />
        {!compact && (
          <ActionButton
            label="Notes"
            disabled={locked}
            onClick={() => !locked && actions.onGenerateNotes(step)}
          />
        )}
        <button
          onClick={onToggle}
          className="ml-auto rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] text-white/65 hover:bg-white/10"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {expanded && !locked && (
        <ExpandedTray sv={sv} actions={actions} />
      )}
    </article>
  );
}

function ExpandedTray({ sv, actions }: { sv: StepView; actions: LearningPathProps }) {
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/80">
      <p>
        <span className="font-semibold text-white">Mastery:</span>{' '}
        {Math.round(sv.mastery * 100)}% (from quiz answers on this concept)
      </p>
      <p className="mt-1">
        <span className="font-semibold text-white">On-card progress:</span> {sv.pct}%
      </p>
      <p className="mt-1">
        <span className="font-semibold text-white">Step XP:</span> {sv.xp} on completion
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ActionButton
          label="Mark complete"
          primary
          onClick={() => {
            setPathProgress(actions.docId, sv.step.order, {
              status: 'completed',
              pct: 100,
              completed_at: new Date().toISOString(),
            });
            pushActivity({
              actor: 'you',
              verb: 'completed step',
              object: `${sv.conceptName} (${actions.docTitle})`,
            });
          }}
        />
        <ActionButton
          label="Reset progress"
          onClick={() =>
            setPathProgress(actions.docId, sv.step.order, { status: 'not_started', pct: 0 })
          }
        />
        <Link
          to={`/tutor?doc=${encodeURIComponent(actions.docId)}&concept=${encodeURIComponent(sv.step.concept_id)}`}
          className="rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
        >
          Ask tutor about {sv.conceptName}
        </Link>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  primary,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
          : 'border border-white/10 text-white/80 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
}

function StepBadge({ order, state }: { order: number; state: StepView['state'] }) {
  const tone =
    state === 'completed'
      ? 'bg-emerald-400 text-emerald-950'
      : state === 'in_progress'
        ? 'bg-gradient-to-br from-primary to-accent text-white shadow-glow'
        : state === 'locked'
          ? 'bg-white/10 text-white/40'
          : 'bg-white/15 text-white';
  const glyph = state === 'completed' ? '✓' : state === 'locked' ? '🔒' : order;
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold tabular-nums ${tone}`}>
      {glyph}
    </span>
  );
}

function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i <= level ? 'bg-accent' : 'bg-white/15'
          }`}
        />
      ))}
    </span>
  );
}

function StateChip({ state }: { state: StepView['state'] }) {
  const tone =
    state === 'completed'
      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
      : state === 'in_progress'
        ? 'bg-primary/15 text-primary-soft border-primary/30'
        : state === 'locked'
          ? 'bg-white/5 text-white/40 border-white/10'
          : 'bg-white/5 text-white/65 border-white/10';
  const label =
    state === 'completed' ? 'Completed'
    : state === 'in_progress' ? 'In progress'
    : state === 'locked' ? 'Locked'
    : 'Not started';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${tone}`}>
      {label}
    </span>
  );
}

function barColor(pct: number): string {
  if (pct >= 70) return '#34d399';
  if (pct >= 40) return '#facc15';
  if (pct > 0) return '#f87171';
  return '#1f2937';
}
