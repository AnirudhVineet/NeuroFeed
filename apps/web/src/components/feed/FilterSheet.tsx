import { useMemo } from 'react';
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
  const docsBySubject = useMemo(() => {
    const map = new Map<Subject, DocOption[]>();
    for (const d of docs) {
      const list = map.get(d.subject) ?? [];
      list.push(d);
      map.set(d.subject, list);
    }
    return map;
  }, [docs]);

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
    onChange({ ...filters, documentIds: new Set(docs.map((d) => d.id)) });
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-modal-root
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-ink/95 p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Feed filters"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Filters</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClear}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                >
                  Clear all
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white"
                >
                  Done
                </button>
              </div>
            </div>

            <Section title="Subjects" right={
              <SelectAllRow
                onAll={selectAllSubjects}
                onNone={deselectAllSubjects}
              />
            }>
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
            </Section>

            <Section title={`Documents (${docs.length})`} right={
              <SelectAllRow onAll={selectAllDocs} onNone={deselectAllDocs} />
            }>
              {docs.length === 0 ? (
                <p className="text-xs text-muted">No documents in this feed yet.</p>
              ) : (
                <div className="space-y-3">
                  {Array.from(docsBySubject.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([subject, group]) => (
                    <div key={subject}>
                      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-white/45">{subject}</p>
                      <div className="space-y-1">
                        {group.map((d) => (
                          <DocRow
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
            </Section>

            <Section title="Type">
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
            </Section>

            <Section title="Flashcard difficulty">
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
            </Section>

            <Section title="Progress">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <span className="text-sm">Hide items I've already finished</span>
                <input
                  type="checkbox"
                  checked={filters.hideCompleted}
                  onChange={(e) =>
                    onChange({ ...filters, hideCompleted: e.target.checked })
                  }
                  className="h-4 w-4 accent-accent"
                />
              </label>
            </Section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-white/60">{title}</h3>
        {right}
      </div>
      {children}
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
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function SelectAllRow({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <button onClick={onAll} className="text-accent hover:underline">Select all</button>
      <span className="text-white/30">·</span>
      <button onClick={onNone} className="text-white/60 hover:text-white hover:underline">Clear</button>
    </div>
  );
}

function DocRow({
  doc,
  checked,
  onToggle,
}: {
  doc: DocOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/8">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-accent"
      />
      <span className="min-w-0 flex-1 truncate text-sm">{doc.title}</span>
    </label>
  );
}
