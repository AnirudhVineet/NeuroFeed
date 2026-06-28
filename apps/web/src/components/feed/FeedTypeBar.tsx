import type { ArtifactType } from '@/lib/feed';

// Type-filter bar that sits above the feed. Solves the most common filter
// need ("just show me reels", "just quizzes") in one tap, without opening the
// full FilterSheet. Multi-select chips: tapping one toggles it, tapping the
// All chip clears every type filter.
//
// Wraps to multiple lines on narrow viewports so every chip is reachable in
// one tap — no horizontal scrolling. Chips stay compact (icon + short label
// + count) so 6 of them fit two-up on phones.
//
// Counts reflect the current feed after every OTHER active filter is applied
// (subjects, docs, difficulty, etc.) so users know exactly what they'd see.

export type TypeCounts = Record<ArtifactType, number>;

interface TypeMeta {
  id: ArtifactType;
  label: string;
  icon: string;
}

const TYPES: TypeMeta[] = [
  { id: 'reel_script', label: 'Reels', icon: 'movie' },
  { id: 'swipe_card', label: 'Cards', icon: 'style' },
  { id: 'flashcard', label: 'Flashcards', icon: 'quiz' },
  { id: 'quiz', label: 'Quizzes', icon: 'help' },
  { id: 'summary', label: 'Summaries', icon: 'description' },
];

export function FeedTypeBar({
  selected,
  counts,
  onToggle,
  onClear,
}: {
  selected: Set<ArtifactType>;
  counts: TypeCounts;
  onToggle: (t: ArtifactType) => void;
  onClear: () => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const allActive = selected.size === 0;

  return (
    <div className="mb-md flex flex-wrap gap-1.5">
      <TypeChip
        icon="apps"
        label="All"
        count={total}
        active={allActive}
        onClick={onClear}
      />
      {TYPES.map((t) => (
        <TypeChip
          key={t.id}
          icon={t.icon}
          label={t.label}
          count={counts[t.id] ?? 0}
          active={selected.has(t.id)}
          onClick={() => onToggle(t.id)}
        />
      ))}
    </div>
  );
}

function TypeChip({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const empty = count === 0;
  // Compact chip — icon + short label + count fit in ~90-110px so 6 chips
  // wrap into 2 rows on phones (3 per row) and a single row on tablets+.
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap';
  const cls = active
    ? `${base} border-transparent bg-gradient-to-br from-primary via-secondary to-accent text-on-primary shadow-glow`
    : empty
      ? `${base} cursor-not-allowed border-outline-variant bg-surface-container text-on-surface-variant opacity-60`
      : `${base} border-outline-variant bg-surface-container text-on-surface hover:border-primary/50 hover:bg-surface-container-high`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty && !active}
      aria-pressed={active}
      className={cls}
      title={label}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '15px' }}
        aria-hidden
      >
        {icon}
      </span>
      <span>{label}</span>
      <span
        className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
          active
            ? 'bg-white/25 text-on-primary'
            : 'bg-surface-container-high text-on-surface-variant'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
