import type { ReactNode } from 'react';

/** Skeleton card sized like a roster row. */
export function RosterSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3"
        >
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-surface-container" />
          <div className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded-full bg-surface-container" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded-full bg-surface-container-low" />
            <div className="flex gap-1.5">
              <span className="block h-2.5 w-12 animate-pulse rounded-full bg-surface-container-low" />
              <span className="block h-2.5 w-10 animate-pulse rounded-full bg-surface-container-low" />
            </div>
          </div>
          <span className="h-7 w-16 shrink-0 animate-pulse rounded-full bg-surface-container" />
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
        <li key={i} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 animate-pulse rounded-full bg-surface-container" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3 w-2/3 animate-pulse rounded-full bg-surface-container" />
              <span className="block h-2.5 w-1/2 animate-pulse rounded-full bg-surface-container-low" />
            </div>
          </div>
          <span className="mt-3 block h-7 w-full animate-pulse rounded-full bg-surface-container" />
        </li>
      ))}
    </ul>
  );
}

/** Friendly error block with a retry button. */
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
          ? 'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container'
          : 'rounded-xl border border-error/30 bg-error-container/40 p-md text-center text-body-md text-on-error-container'
      }
    >
      <div className={inline ? '' : 'mx-auto max-w-md'}>
        <p className="font-bold text-on-error-container">{title}</p>
        <p className={inline ? 'mt-0.5 opacity-80' : 'mt-1 opacity-80'}>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-4 py-1.5 text-label-md font-bold text-on-primary-container"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
          Try again
        </button>
      )}
    </div>
  );
}

/** Empty-state card. */
export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant p-xl text-center text-body-sm text-on-surface-variant">
      {message}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Banner shown when one panel of a multi-panel page partially fails. */
export function PartialFailBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-error/30 bg-error-container/30 p-2.5 text-label-sm text-on-error-container">
      <span className="inline-flex items-center gap-1">
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>warning</span>
        {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-full border border-error/30 bg-error-container/50 px-2.5 py-1 text-label-sm font-bold text-on-error-container hover:brightness-95"
        >
          Retry
        </button>
      )}
    </div>
  );
}
