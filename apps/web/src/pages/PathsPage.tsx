import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { fetchAnalytics, type MasteryRow } from '@/lib/analytics';
import { inferSubject, SUBJECTS, type Subject } from '@/lib/subjects';
import { supabase } from '@/lib/supabase';
import { useSocial } from '@/lib/social';
import { LearningPath, type ConceptIndex } from '@/components/learning/LearningPath';
import type { LearningPathStep } from '../../../../packages/shared-types/artifacts';

interface ArtifactRow<T = unknown> {
  id: string;
  type: string;
  payload: T;
  concept_id: string | null;
  created_at: string;
}

interface GroupedArtifacts {
  learning_path_step?: ArtifactRow<LearningPathStep>[];
  flashcard?: ArtifactRow[];
  quiz?: ArtifactRow[];
  swipe_card?: ArtifactRow[];
}

interface PathBundle {
  doc: DocSummary & { subject: Subject };
  steps: ArtifactRow<LearningPathStep>[];
  conceptIndex: ConceptIndex;
}

export default function PathsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [docs, setDocs] = useState<(DocSummary & { subject: Subject })[]>([]);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [bundles, setBundles] = useState<Record<string, GroupedArtifacts>>({});
  const [active, setActive] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<Subject | 'all'>('all');
  const [err, setErr] = useState<string | null>(null);
  const social = useSocial();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try {
        const [d, a] = await Promise.all([fetchDocuments(uid), fetchAnalytics(uid)]);
        const enriched = d.items
          .filter((doc) => doc.counts.learning_path_step > 0)
          .map((doc) => ({ ...doc, subject: inferSubject(doc.title) }));
        setDocs(enriched);
        setMastery(a.mastery);
        if (enriched.length && !active) setActive(enriched[0].id);
        // Lazily pull artifacts per doc, in parallel.
        const fetched = await Promise.all(
          enriched.map((doc) =>
            api<GroupedArtifacts>(`/api/documents/${encodeURIComponent(doc.id)}/artifacts`)
              .then((g) => [doc.id, g] as const)
              .catch(() => [doc.id, {}] as const),
          ),
        );
        const map: Record<string, GroupedArtifacts> = {};
        for (const [id, g] of fetched) map[id] = g;
        setBundles(map);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (subjectFilter === 'all') return docs;
    return docs.filter((d) => d.subject === subjectFilter);
  }, [docs, subjectFilter]);

  const activeBundle: PathBundle | null = useMemo(() => {
    const doc = filtered.find((d) => d.id === active);
    if (!doc) return null;
    const group = bundles[doc.id] ?? {};
    const idx: ConceptIndex = {};
    for (const m of mastery) idx[m.concept_id] = { name: m.name, mastery: m.score };
    const all = ([] as ArtifactRow[]).concat(
      group.flashcard ?? [],
      group.quiz ?? [],
      group.swipe_card ?? [],
    );
    for (const r of all) {
      if (r.concept_id && !idx[r.concept_id]) {
        const p = r.payload as Record<string, unknown> | undefined;
        const name = (typeof p?.name === 'string' && p.name) ||
                     (typeof p?.title === 'string' && p.title) ||
                     r.concept_id.slice(0, 6);
        idx[r.concept_id] = { name: String(name), mastery: 0 };
      }
    }
    return { doc, steps: group.learning_path_step ?? [], conceptIndex: idx };
  }, [active, filtered, bundles, mastery]);

  // Aggregate progress across all paths — used in the header.
  const aggregate = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const [docId, group] of Object.entries(bundles)) {
      const steps = group.learning_path_step ?? [];
      total += steps.length;
      for (const s of steps) {
        const stored = social.path_progress[`${docId}:${s.payload.order}`];
        if (stored?.status === 'completed') completed += 1;
      }
    }
    return { total, completed, pct: total ? Math.round((completed / total) * 100) : 0 };
  }, [bundles, social.path_progress]);

  if (!userId) return <Empty msg="Sign in to view your learning paths." />;
  if (err) return <Empty msg={err} />;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-24">
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-white/55">Learning</p>
        <h1 className="text-2xl font-bold text-white">Your learning paths</h1>
        <p className="text-sm text-white/65">
          Roadmaps generated from each document. Tap any step to start, mark complete, or jump to
          the matching reel, quiz, or tutor session.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <ProgressBadge pct={aggregate.pct} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-white/60">
              <span className="font-semibold text-white">{aggregate.completed}</span> /{' '}
              {aggregate.total} steps completed across {docs.length} paths
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-primary via-secondary to-accent"
                style={{ width: `${aggregate.pct}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        <aside className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <FilterChip active={subjectFilter === 'all'} onClick={() => setSubjectFilter('all')}>
              All
            </FilterChip>
            {SUBJECTS.map((s) => (
              <FilterChip
                key={s}
                active={subjectFilter === s}
                onClick={() => setSubjectFilter(s)}
              >
                {s}
              </FilterChip>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/55">
              No documents with learning paths yet. <Link to="/upload" className="text-primary">Upload one</Link>.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((d) => {
                const group = bundles[d.id];
                const steps = group?.learning_path_step ?? [];
                const completed = steps.filter(
                  (s) => social.path_progress[`${d.id}:${s.payload.order}`]?.status === 'completed',
                ).length;
                const pct = steps.length ? Math.round((completed / steps.length) * 100) : 0;
                const isActive = active === d.id;
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => setActive(d.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? 'border-primary/40 bg-primary/[0.08]'
                          : 'border-white/10 bg-white/[0.03] hover:border-primary/30 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-widest text-white/70">
                          {d.subject}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-white/55">{pct}%</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm font-semibold text-white">{d.title}</p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-white/55">
                        {completed} / {steps.length} steps
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0">
          {activeBundle ? (
            <LearningPath
              docId={activeBundle.doc.id}
              docTitle={activeBundle.doc.title}
              steps={activeBundle.steps}
              conceptIndex={activeBundle.conceptIndex}
              onOpenReel={() => (window.location.href = `/?doc=${encodeURIComponent(activeBundle.doc.id)}`)}
              onOpenStory={() => (window.location.href = `/?doc=${encodeURIComponent(activeBundle.doc.id)}`)}
              onOpenQuiz={() => (window.location.href = `/doc/${encodeURIComponent(activeBundle.doc.id)}#quiz`)}
              onOpenFlashcards={() => (window.location.href = `/doc/${encodeURIComponent(activeBundle.doc.id)}#flashcards`)}
              onOpenTutor={() => (window.location.href = `/tutor?doc=${encodeURIComponent(activeBundle.doc.id)}`)}
              onGenerateNotes={() => (window.location.href = `/tutor?doc=${encodeURIComponent(activeBundle.doc.id)}`)}
            />
          ) : (
            <Empty msg="Pick a path on the left to start." />
          )}
        </section>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-primary/40 bg-primary/15 text-white'
          : 'border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ProgressBadge({ pct }: { pct: number }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent text-sm font-bold tabular-nums text-white shadow-glow">
      {pct}%
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="px-8 pb-32 pt-32 text-center text-sm text-white/55">{msg}</div>;
}
