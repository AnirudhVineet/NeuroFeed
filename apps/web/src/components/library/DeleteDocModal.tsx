import { useEffect, useState } from 'react';
import type { Visibility } from '@/lib/social';

// Two-step flow:
//   1. The user picks one of the option rows (visual select only — nothing
//      runs yet). Avoids accidental destructive actions on misclick.
//   2. The user clicks the Apply button in the footer to commit.
//
// Four conceptual outcomes:
//   - publish     — push every artifact to Global Feed (sets visibility=public)
//   - hide        — remove from My Feed, keep public in Global Feed
//   - unpublish   — remove from Global Feed, keep in My Feed (sets private)
//   - delete      — hard delete: cascade artifacts + storage object
// Each option is always shown — the ones that would be no-ops for the current
// state are visibly disabled with a hint, so users always see every possible
// outcome rather than having options pop in/out based on state.

export type DeleteAction = 'publish' | 'hide' | 'unpublish' | 'delete';

export interface DeleteDocModalProps {
  open: boolean;
  title: string;
  visibility: Visibility;
  onCancel: () => void;
  onConfirm: (action: DeleteAction) => Promise<void> | void;
}

export function DeleteDocModal({
  open,
  title,
  visibility,
  onCancel,
  onConfirm,
}: DeleteDocModalProps) {
  const [selected, setSelected] = useState<DeleteAction | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset selection whenever the modal closes so re-opening starts clean.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const isPrivate = visibility === 'private';
  const isPublic = visibility === 'public';

  async function apply() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await onConfirm(selected);
    } finally {
      setBusy(false);
    }
  }

  const applyMeta: Record<DeleteAction, { label: string; danger: boolean }> = {
    publish: { label: 'Publish to Global Feed', danger: false },
    hide: { label: 'Hide from My Feed', danger: false },
    unpublish: { label: 'Make Private', danger: false },
    delete: { label: 'Delete forever', danger: true },
  };
  const apMeta = selected ? applyMeta[selected] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete options"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-outline-variant px-5 py-4">
          <h2 className="text-base font-semibold text-on-surface">What do you want to do?</h2>
          <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{title}</p>
          <p className="mt-2 text-[11px] text-on-surface-variant">
            Pick one option, then press <span className="font-semibold text-on-surface">Apply</span>.
          </p>
        </div>
        <div className="flex flex-col gap-2 p-4" role="radiogroup">
          <OptionRow
            icon="public"
            label="Publish to Global Feed"
            desc={
              isPublic
                ? "Already public — every reel, flashcard, swipe card, and quiz is in Global Feed."
                : "Pushes every reel, flashcard, swipe card, and quiz from this doc to Global Feed so others can discover them."
            }
            tone="primary"
            selected={selected === 'publish'}
            disabled={busy || isPublic}
            onSelect={() => setSelected('publish')}
          />
          <OptionRow
            icon="visibility_off"
            label="Remove from My Feed"
            desc={
              visibility === 'public'
                ? "Hides it from your feed and dashboard. Others can still discover it in Global Feed."
                : visibility === 'friends'
                  ? "Hides it from your feed. Friends can still see it."
                  : "Hides it from your feed. The doc and its artifacts stay in storage."
            }
            tone="neutral"
            selected={selected === 'hide'}
            disabled={busy}
            onSelect={() => setSelected('hide')}
          />
          <OptionRow
            icon="public_off"
            label="Remove from Global Feed"
            desc={
              isPrivate
                ? "Already private — this doc isn't in Global Feed."
                : "Makes it private. Others lose access, but it stays in your library and My Feed."
            }
            tone="neutral"
            selected={selected === 'unpublish'}
            disabled={busy || isPrivate}
            onSelect={() => setSelected('unpublish')}
          />
          <OptionRow
            icon="delete_forever"
            label="Delete completely"
            desc="Removes the document, every generated reel/card/quiz, and the uploaded file. This can't be undone."
            tone="danger"
            selected={selected === 'delete'}
            disabled={busy}
            onSelect={() => setSelected('delete')}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-outline-variant bg-surface-container px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full border border-outline bg-surface-container-high px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={apply}
            className={
              apMeta?.danger
                ? 'inline-flex items-center justify-center gap-2 rounded-full bg-error px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-on-error shadow-lg ring-2 ring-error/30 transition-all hover:brightness-110 hover:ring-error/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:ring-0'
                : 'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary via-primary to-secondary px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-on-primary shadow-lg ring-2 ring-primary/30 transition-all hover:brightness-110 hover:ring-primary/60 disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:bg-none disabled:text-on-surface-variant disabled:opacity-60 disabled:shadow-none disabled:ring-0'
            }
          >
            {busy ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin"
                  style={{ fontSize: '18px' }}
                  aria-hidden
                >
                  progress_activity
                </span>
                Applying…
              </>
            ) : (
              <>
                {apMeta && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '18px' }}
                    aria-hidden
                  >
                    {apMeta.danger ? 'delete_forever' : 'check'}
                  </span>
                )}
                {apMeta?.label ?? 'Select an option'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  icon,
  label,
  desc,
  tone,
  selected,
  disabled,
  onSelect,
}: {
  icon: string;
  label: string;
  desc: string;
  tone: 'neutral' | 'danger' | 'primary';
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const base =
    'group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all';

  let cls: string;
  if (selected) {
    cls =
      tone === 'danger'
        ? `${base} border-error bg-error text-on-error shadow-lg ring-2 ring-error/40`
        : tone === 'primary'
          ? `${base} border-primary bg-primary text-on-primary shadow-lg ring-2 ring-primary/40`
          : `${base} border-primary bg-primary-container text-on-primary-container shadow-lg ring-2 ring-primary/40`;
  } else if (disabled) {
    cls = `${base} cursor-not-allowed border-outline-variant bg-surface-container text-on-surface-variant opacity-50`;
  } else if (tone === 'danger') {
    cls =
      `${base} border-error/40 bg-error-container/30 text-on-error-container hover:border-error hover:bg-error-container/60`;
  } else if (tone === 'primary') {
    cls =
      `${base} border-primary/40 bg-primary-container/40 text-on-primary-container hover:border-primary hover:bg-primary-container/70`;
  } else {
    cls =
      `${base} border-outline-variant bg-surface-container text-on-surface hover:border-primary/50 hover:bg-surface-container-high`;
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cls}
    >
      <span
        className="material-symbols-outlined mt-0.5 shrink-0"
        style={{ fontSize: '22px' }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className={`mt-0.5 block text-[11px] leading-snug ${selected ? 'opacity-95' : 'opacity-80'}`}>
          {desc}
        </span>
      </span>
      <span
        aria-hidden
        className={`material-symbols-outlined shrink-0 self-center transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ fontSize: '20px' }}
      >
        check_circle
      </span>
    </button>
  );
}
