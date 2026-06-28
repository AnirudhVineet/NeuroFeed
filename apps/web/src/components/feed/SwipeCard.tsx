import type { SwipeCard as SwipeCardData } from '../../../../../packages/shared-types/artifacts';

// Compact inline card for the home feed. The accent color from the artifact
// drives a subtle gradient wash on top of the theme-aware surface — the
// underlying `rgb(var(--surface-container-lowest))` swaps from white in
// light mode to near-black in dark mode, so the card body stays contrasty
// with its text in both themes.
export function SwipeCard({
  data,
  override,
}: {
  data: SwipeCardData;
  override?: { title: string; body: string } | null;
}) {
  const title = override?.title ?? data.title;
  const body = override?.body ?? data.body;
  return (
    <div
      className="flex flex-col gap-md rounded-xl border border-outline-variant p-md"
      style={{
        background: `linear-gradient(135deg, ${data.accent_color}1f, transparent 60%), rgb(var(--surface-container-lowest))`,
      }}
    >
      <div className="flex items-center gap-sm">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-headline-sm"
          style={{ background: `${data.accent_color}26` }}
          aria-hidden
        >
          {data.icon}
        </div>
        <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
          {override ? 'Simpler take' : 'Swipe card'}
        </span>
      </div>
      <h2 className="text-headline-sm text-on-surface">{title}</h2>
      <p className="text-body-md text-on-surface-variant">{body}</p>
    </div>
  );
}
