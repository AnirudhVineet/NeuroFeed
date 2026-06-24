import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ArtifactType } from '@/lib/feed';
import { SUBJECTS, type Subject } from '@/lib/subjects';

// All possible card types that can appear in the feed.
export const TYPES: { id: ArtifactType; label: string }[] = [
  { id: 'reel_script', label: 'Reels' },
  { id: 'swipe_card', label: 'Cards' },
  { id: 'flashcard', label: 'Flashcards' },
  { id: 'quiz', label: 'Quizzes' },
  { id: 'summary', label: 'Summaries' },
];

export type Difficulty = 1 | 2 | 3;
export const DIFFICULTIES: Difficulty[] = [1, 2, 3];

export interface FeedFilters {
  subjects: Set<Subject>;
  documentIds: Set<string>;
  types: Set<ArtifactType>;
  difficulties: Set<Difficulty>;
  hideCompleted: boolean;
}

export function emptyFilters(): FeedFilters {
  return {
    subjects: new Set(),
    documentIds: new Set(),
    types: new Set(),
    difficulties: new Set(),
    hideCompleted: false,
  };
}

export function countActive(f: FeedFilters): number {
  return (
    f.subjects.size +
    f.documentIds.size +
    f.types.size +
    f.difficulties.size +
    (f.hideCompleted ? 1 : 0)
  );
}

export interface DocOption {
  id: string;
  title: string;
  subject: Subject;
}

type SectionId = 'subjects' | 'documents' | 'type' | 'difficulty' | 'progress';

export function FilterSheet({
  open,
  filters,
  docs,
  onChange,
  onClose,
  onClear,
}: {
  open: boolean;
  filters: FeedFilters;
  docs: DocOption[];
  onChange: (next: FeedFilters) => void;
  onClose: () => void;
  onClear: () => void;
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
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-gradient-to-b from-card/95 to-ink/95 text-white shadow-soft-lg backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Feed filters"
          >
            {/* Header */}
            <div className="shrink-0 px-5 pb-3 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Filters</h2>
                  <p className="text-[11px] text-white/55">
                    {activeCount === 0
                      ? 'No filters active'
                      : `${activeCount} filter${activeCount === 1 ? '' : 's'} active`}
                  </p>
                </div>
                <button
                  onClick={onClear}
                  disabled={activeCount === 0}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
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
                  <p className="text-xs text-white/55">No documents in this feed yet.</p>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <svg
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
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
                        className="w-full rounded-full border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-primary"
                      />
                    </div>
                    {filteredDocs.length === 0 ? (
                      <p className="px-1 text-xs text-white/55">No documents match "{docSearch}".</p>
                    ) : (
                      <div className="space-y-3">
                        {Array.from(docsBySubject.entries())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([subject, group]) => (
                            <div key={subject}>
                              <p className="mb-1.5 text-[10px] uppercase tracking-widest text-white/45">
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

              <CollapsibleSection
                title="Progress"
                badge={filters.hideCompleted ? 1 : 0}
                open={openSections.has('progress')}
                onToggle={() => toggleSection('progress')}
              >
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 transition-colors hover:bg-white/[0.06]">
                  <span className="text-sm text-white">Hide items I've already finished</span>
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
              className="shrink-0 border-t border-white/10 bg-black/40 px-5 py-3 backdrop-blur-xl"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
            >
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.04] py-2.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={onClose}
                  className="flex-[2] rounded-full bg-gradient-to-br from-primary via-secondary to-accent py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] active:scale-[0.99]"
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
    <section className="mb-2.5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
        aria-expanded={open}
      >
        <span className="flex-1 text-sm font-semibold text-white">{title}</span>
        {badge > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent px-1.5 text-[10px] font-bold tabular-nums shadow-glow">
            {badge}
          </span>
        )}
        <svg
          className={`h-4 w-4 text-white/55 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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
          ? 'border-transparent bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
          : 'border-white/12 bg-white/[0.04] text-white/75 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
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
      <span className="text-white/25">·</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNone();
        }}
        className="text-white/55 hover:text-white hover:underline"
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
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? 'border-transparent bg-gradient-to-br from-primary to-accent'
            : 'border-white/25 bg-white/5'
        }`}
        aria-hidden
      >
        {checked && (
          <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-white">{doc.title}</span>
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
        checked ? 'bg-gradient-to-r from-primary to-accent shadow-glow' : 'bg-white/15'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
