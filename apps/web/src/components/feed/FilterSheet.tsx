import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ArtifactType } from '@/lib/feed';
import type { Visibility } from '@/lib/social';
import { SUBJECTS, type Subject } from '@/lib/subjects';

// All possible card types that can appear in the feed.
export const TYPES: { id: ArtifactType; label: string }[] = [
  { id: 'reel_script', label: 'Reels' },
  { id: 'swipe_card', label: 'Cards' },
  { id: 'flashcard', label: 'Flashcards' },
  { id: 'quiz', label: 'Quizzes' },
  { id: 'summary', label: 'Summaries' },
];

const VISIBILITIES: { id: Visibility; label: string; icon: string }[] = [
  { id: 'private', label: 'Private', icon: 'lock' },
  { id: 'friends', label: 'Friends', icon: 'group' },
  { id: 'public', label: 'Public', icon: 'public' },
];

export type Difficulty = 1 | 2 | 3;
export const DIFFICULTIES: Difficulty[] = [1, 2, 3];

export interface FeedFilters {
  subjects: Set<Subject>;
  documentIds: Set<string>;
  types: Set<ArtifactType>;
  difficulties: Set<Difficulty>;
  visibilities: Set<Visibility>;
  hideCompleted: boolean;
}

export function emptyFilters(): FeedFilters {
  return {
    subjects: new Set(),
    documentIds: new Set(),
    types: new Set(),
    difficulties: new Set(),
    visibilities: new Set(),
    hideCompleted: false,
  };
}

export function countActive(f: FeedFilters): number {
  return (
    f.subjects.size +
    f.documentIds.size +
    f.types.size +
    f.difficulties.size +
    f.visibilities.size +
    (f.hideCompleted ? 1 : 0)
  );
}

export interface DocOption {
  id: string;
  title: string;
  subject: Subject;
  // Optional — only known on My Feed (when the user owns the doc and its
  // visibility is stored client-side). Absent on Global where everything is
  // public by definition.
  visibility?: Visibility | null;
}

type SectionId = 'subjects' | 'documents' | 'type' | 'difficulty' | 'visibility' | 'progress';

export function FilterSheet({
  open,
  filters,
  docs,
  onChange,
  onClose,
  onClear,
  showVisibility = true,
}: {
  open: boolean;
  filters: FeedFilters;
  docs: DocOption[];
  onChange: (next: FeedFilters) => void;
  onClose: () => void;
  onClear: () => void;
  // Visibility filter is meaningless on the Global feed (everything's public),
  // so callers can hide that section by setting this to false.
  showVisibility?: boolean;
}) {
  const [docSearch, setDocSearch] = useState('');
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    () => new Set<SectionId>(['subjects', 'documents', 'type']),
  );

  useEffect(() => {
    if (!open) setDocSearch('');
  }, [open]);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, docSearch]);

  const docsBySubject = useMemo(() => {
    const map = new Map<Subject, DocOption[]>();
    for (const d of filteredDocs) {
      const list = map.get(d.subject) ?? [];
      list.push(d);
      map.set(d.subject, list);
    }
    return map;
  }, [filteredDocs]);

  function toggleSection(id: SectionId) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSubject(s: Subject) {
    const next = new Set(filters.subjects);
    next.has(s) ? next.delete(s) : next.add(s);
    onChange({ ...filters, subjects: next });
  }
  function toggleDoc(id: string) {
    const next = new Set(filters.documentIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ ...filters, documentIds: next });
  }
  function toggleType(t: ArtifactType) {
    const next = new Set(filters.types);
    next.has(t) ? next.delete(t) : next.add(t);
    onChange({ ...filters, types: next });
  }
  function toggleDifficulty(d: Difficulty) {
    const next = new Set(filters.difficulties);
    next.has(d) ? next.delete(d) : next.add(d);
    onChange({ ...filters, difficulties: next });
  }
  function toggleVisibility(v: Visibility) {
    const next = new Set(filters.visibilities);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange({ ...filters, visibilities: next });
  }
  function selectAllDocs() {
    onChange({ ...filters, documentIds: new Set(filteredDocs.map((d) => d.id)) });
  }
  function deselectAllDocs() {
    onChange({ ...filters, documentIds: new Set() });
  }
  function selectAllSubjects() {
    onChange({ ...filters, subjects: new Set(SUBJECTS) });
  }
  function deselectAllSubjects() {
    onChange({ ...filters, subjects: new Set() });
  }

  const activeCount = countActive(filters);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-modal-root
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-outline-variant bg-surface-container-lowest text-on-surface shadow-soft-lg backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Feed filters"
          >
            {/* Header */}
            <div className="shrink-0 px-5 pb-3 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-container-high" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Filters</h2>
                  <p className="text-[11px] text-on-surface-variant">
                    {activeCount === 0
                      ? 'No filters active'
                      : `${activeCount} filter${activeCount === 1 ? '' : 's'} active`}
                  </p>
                </div>
                <button
                  onClick={onClear}
                  disabled={activeCount === 0}
                  className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-30"
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-2">
              <CollapsibleSection
                title="Subjects"
                badge={filters.subjects.size}
                open={openSections.has('subjects')}
                onToggle={() => toggleSection('subjects')}
                right={
                  <SelectAllRow onAll={selectAllSubjects} onNone={deselectAllSubjects} />
                }
              >
                <ChipGrid>
                  {SUBJECTS.map((s) => (
                    <Chip
                      key={s}
                      active={filters.subjects.has(s)}
                      onClick={() => toggleSubject(s)}
                    >
                      {s}
                    </Chip>
                  ))}
                </ChipGrid>
              </CollapsibleSection>

              <CollapsibleSection
                title="Documents"
                badge={filters.documentIds.size}
                open={openSections.has('documents')}
                onToggle={() => toggleSection('documents')}
                right={
                  <SelectAllRow onAll={selectAllDocs} onNone={deselectAllDocs} />
                }
              >
                {docs.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">No documents in this feed yet.</p>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <svg
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      <input
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                        placeholder="Search documents…"
                        className="w-full rounded-full border border-outline-variant bg-surface-container py-2 pl-9 pr-3 text-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
                      />
                    </div>
                    {filteredDocs.length === 0 ? (
                      <p className="px-1 text-xs text-on-surface-variant">No documents match "{docSearch}".</p>
                    ) : (
                      <div className="space-y-3">
                        {Array.from(docsBySubject.entries())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([subject, group]) => (
                            <div key={subject}>
                              <p className="mb-1.5 text-[10px] uppercase tracking-widest text-outline">
                                {subject}
                              </p>
                              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                {group.map((d) => (
                                  <DocSelectCard
                                    key={d.id}
                                    doc={d}
                                    checked={filters.documentIds.has(d.id)}
                                    onToggle={() => toggleDoc(d.id)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Content type"
                badge={filters.types.size}
                open={openSections.has('type')}
                onToggle={() => toggleSection('type')}
              >
                <ChipGrid>
                  {TYPES.map((t) => (
                    <Chip
                      key={t.id}
                      active={filters.types.has(t.id)}
                      onClick={() => toggleType(t.id)}
                    >
                      {t.label}
                    </Chip>
                  ))}
                </ChipGrid>
              </CollapsibleSection>

              <CollapsibleSection
                title="Difficulty"
                badge={filters.difficulties.size}
                open={openSections.has('difficulty')}
                onToggle={() => toggleSection('difficulty')}
              >
                <ChipGrid>
                  {DIFFICULTIES.map((d) => (
                    <Chip
                      key={d}
                      active={filters.difficulties.has(d)}
                      onClick={() => toggleDifficulty(d)}
                    >
                      {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
                    </Chip>
                  ))}
                </ChipGrid>
              </CollapsibleSection>

              {showVisibility && (
                <CollapsibleSection
                  title="Visibility"
                  badge={filters.visibilities.size}
                  open={openSections.has('visibility')}
                  onToggle={() => toggleSection('visibility')}
                >
                  <ChipGrid>
                    {VISIBILITIES.map((v) => (
                      <Chip
                        key={v.id}
                        active={filters.visibilities.has(v.id)}
                        onClick={() => toggleVisibility(v.id)}
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden>{v.icon}</span>
                          {v.label}
                        </span>
                      </Chip>
                    ))}
                  </ChipGrid>
                </CollapsibleSection>
              )}

              <CollapsibleSection
                title="Progress"
                badge={filters.hideCompleted ? 1 : 0}
                open={openSections.has('progress')}
                onToggle={() => toggleSection('progress')}
              >
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-outline-variant bg-surface-container px-3 py-3 transition-colors hover:bg-surface-container-high">
                  <span className="text-sm text-on-surface">Hide items I've already finished</span>
                  <Toggle
                    checked={filters.hideCompleted}
                    onChange={(checked) =>
                      onChange({ ...filters, hideCompleted: checked })
                    }
                  />
                </label>
              </CollapsibleSection>

              <div className="h-2" />
            </div>

            {/* Sticky footer */}
            <div
              className="shrink-0 border-t border-outline-variant bg-surface-container px-5 py-3 backdrop-blur-xl"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
            >
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-full border border-outline-variant bg-surface-container py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                >
                  Cancel
                </button>
                <button
                  onClick={onClose}
                  className="flex-[2] rounded-full bg-gradient-to-br from-primary via-secondary to-accent py-2.5 text-sm font-semibold text-on-primary shadow-glow transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  Apply filters{activeCount > 0 ? ` (${activeCount})` : ''}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CollapsibleSection({
  title,
  badge,
  open,
  onToggle,
  right,
  children,
}: {
  title: string;
  badge: number;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-2.5 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-container"
        aria-expanded={open}
      >
        <span className="flex-1 text-sm font-semibold text-on-surface">{title}</span>
        {badge > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent px-1.5 text-[10px] font-bold tabular-nums text-on-primary shadow-glow">
            {badge}
          </span>
        )}
        <svg
          className={`h-4 w-4 text-on-surface-variant transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {right && <div className="mb-2 flex justify-end">{right}</div>}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ChipGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
        active
          ? 'border-transparent bg-gradient-to-br from-primary via-secondary to-accent text-on-primary shadow-glow'
          : 'border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}

function SelectAllRow({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAll();
        }}
        className="text-primary hover:underline"
      >
        Select all
      </button>
      <span className="text-outline">·</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNone();
        }}
        className="text-on-surface-variant hover:text-on-surface hover:underline"
      >
        Clear
      </button>
    </div>
  );
}

function DocSelectCard({
  doc,
  checked,
  onToggle,
}: {
  doc: DocOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
        checked
          ? 'border-primary/50 bg-primary/10 shadow-glow'
          : 'border-outline-variant bg-surface-container-lowest hover:border-outline hover:bg-surface-container-high'
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? 'border-transparent bg-gradient-to-br from-primary to-accent'
            : 'border-outline bg-surface-container-low'
        }`}
        aria-hidden
      >
        {checked && (
          <svg className="h-3 w-3 text-on-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{doc.title}</span>
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-gradient-to-r from-primary to-accent shadow-glow' : 'bg-surface-container-high'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow-soft transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
