import type { ReactNode } from 'react';

/** Skeleton card sized like a roster row. Reused across Social pages so the UI
 *  never shows a blank screen while data is loading. */
export function RosterSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
        >
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded-full bg-white/10" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded-full bg-white/[0.07]" />
            <div className="flex gap-1.5">
              <span className="block h-2.5 w-12 animate-pulse rounded-full bg-white/[0.06]" />
              <span className="block h-2.5 w-10 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          </div>
          <span className="h-7 w-16 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
        </li>
      ))}
    </ul>
  );
}

/** Compact grid of suggested-user cards (skeleton). */
export function SuggestedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
              <span className="block h-2.5 w-1/2 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          </div>
          <span className="mt-3 block h-7 w-full animate-pulse rounded-full bg-white/[0.08]" />
        </li>
      ))}
    </ul>
  );
}

/** Friendly error block with a retry button. Pass `inline` for tighter layouts. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  inline = false,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  inline?: boolean;
}) {
  return (
    <div
      role="alert"
      className={
        inline
          ? 'flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-3 text-xs text-rose-100'
          : 'rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-6 text-center text-sm text-rose-100'
      }
    >
      <div className={inline ? '' : 'mx-auto max-w-md'}>
        <p className="font-semibold text-white">{title}</p>
        <p className={inline ? 'mt-0.5 text-rose-100/80' : 'mt-1 text-rose-100/80'}>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-4 py-1.5 text-xs font-semibold text-white shadow-glow"
        >
          ↻ Try again
        </button>
      )}
    </div>
  );
}

/** Empty-state card with a centered message and optional CTA. */
export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/55">
      {message}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Banner shown when one panel of a multi-panel page partially fails — lets the
 *  page keep rendering the bits that did load. */
export function PartialFailBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-2.5 text-[11px] text-amber-100">
      <span>⚠ {message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-full border border-amber-200/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-50 hover:bg-amber-400/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}
