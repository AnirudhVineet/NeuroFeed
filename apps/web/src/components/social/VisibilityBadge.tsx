import type { Visibility } from '@/lib/social';

// Compact visibility chip — lock/group/globe icon + label, theme-aware tones.
// Renders the same in light and dark themes via semantic surface tokens.

const META: Record<Visibility, { icon: string; label: string; toneClass: string }> = {
  private: {
    icon: 'lock',
    label: 'Private',
    toneClass: 'bg-surface-container-high text-on-surface-variant',
  },
  friends: {
    icon: 'group',
    label: 'Friends',
    toneClass: 'bg-tertiary-container/40 text-on-tertiary-container',
  },
  public: {
    icon: 'public',
    label: 'Public',
    toneClass: 'bg-primary-container/40 text-on-primary-container',
  },
};

export function VisibilityBadge({
  visibility,
  size = 'sm',
  hideLabel = false,
}: {
  visibility: Visibility | null | undefined;
  size?: 'sm' | 'md';
  hideLabel?: boolean;
}) {
  // Legacy rows without a stored visibility default to private — matches the
  // backend default for new uploads since the 2026-06-22 social migration.
  const v: Visibility = visibility ?? 'private';
  const meta = META[v];
  const iconSize = size === 'md' ? '16px' : '14px';
  const cls =
    size === 'md'
      ? `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm font-bold ${meta.toneClass}`
      : `inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.toneClass}`;
  return (
    <span className={cls} title={`Visibility: ${meta.label}`}>
      <span className="material-symbols-outlined" style={{ fontSize: iconSize }} aria-hidden>
        {meta.icon}
      </span>
      {!hideLabel && <span>{meta.label}</span>}
    </span>
  );
}
