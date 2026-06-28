import { useEffect, useState } from 'react';

// Neural-themed loading screen ported from loading.html. Used as the lazy-
// route Suspense fallback in App.tsx, and exposed via the `fullscreen` prop
// for first-paint use cases (or kept inline for code-split route swaps).
//
// Pure CSS animations + a single rotating tip text; no extra deps. Theme-
// aware via semantic tokens so light + dark both look right.

const TIPS = [
  'Preparing your insights…',
  'Loading your personalized study feed…',
  'Connecting neural synapses…',
  'Syncing your knowledge graph…',
  'Personalizing your reels…',
];

export function LoadingScreen({
  fullscreen = false,
  message,
}: {
  fullscreen?: boolean;
  message?: string;
}) {
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    if (message) return; // explicit message overrides the rotation
    const t = window.setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 3500);
    return () => window.clearInterval(t);
  }, [message]);

  const headline = message ?? TIPS[tipIdx];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={
        fullscreen
          ? 'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6 text-on-background'
          : 'flex w-full flex-col items-center justify-center gap-8 px-6 py-16 text-on-background'
      }
    >
      {/* Decorative glow halo behind the icon */}
      <div className="relative flex h-44 w-44 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-3xl" />

        {/* Slow-rotating dashed ring */}
        <svg
          className="absolute inset-0 h-full w-full animate-[spin_10s_linear_infinite] text-primary/60"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.6"
            strokeDasharray="4 4"
          />
        </svg>

        {/* Synapse dots */}
        <span className="loading-synapse loading-synapse-1" />
        <span className="loading-synapse loading-synapse-2" />
        <span className="loading-synapse loading-synapse-3" />

        {/* Central hub icon, gently pulsing */}
        <div className="loading-pulse flex h-24 w-24 items-center justify-center rounded-full border border-primary/30 bg-primary/15 backdrop-blur-sm">
          <span
            className="material-symbols-outlined text-5xl text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            hub
          </span>
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="loading-breathing text-sm font-semibold text-on-surface">
          {headline}
        </h2>
        <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-surface-container">
          <div className="loading-progress h-full rounded-full bg-gradient-to-r from-primary via-primary to-secondary" />
        </div>
      </div>

      <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-soft">
        <span
          className="material-symbols-outlined shrink-0 rounded-lg bg-primary-container p-2 text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          lightbulb
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
            Study Tip
          </p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Spaced repetition is{' '}
            <span className="font-bold text-on-surface">2× more effective</span>{' '}
            for long-term retention than cramming.
          </p>
        </div>
      </div>
    </div>
  );
}
