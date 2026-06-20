import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAnalytics, type AnalyticsPayload, type MasteryRow } from '@/lib/analytics';
import {
  deleteDocument,
  fetchDocuments,
  fetchStats,
  regenerateDocument,
  type DashboardStats,
  type DocSummary,
} from '@/lib/dashboard';
import { inferSubject, SUBJECTS, type Subject } from '@/lib/subjects';
import { supabase } from '@/lib/supabase';
import { useGamify } from '@/state/gamify';

type SortKey = 'recent' | 'oldest' | 'title' | 'reels' | 'total';

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [subjectFilter, setSubjectFilter] = useState<Subject | 'all'>('all');
  const gamify = useGamify((s) => s.state);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try {
        const [a, s, d] = await Promise.all([
          fetchAnalytics(uid),
          fetchStats(uid),
          fetchDocuments(uid),
        ]);
        setAnalytics(a);
        setStats(s);
        setDocs(d.items);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const docsEnriched = useMemo(
    () => docs.map((d) => ({ ...d, subject: inferSubject(d.title) })),
    [docs],
  );

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = docsEnriched.filter((d) => {
      if (subjectFilter !== 'all' && d.subject !== subjectFilter) return false;
      if (q && !d.title.toLowerCase().includes(q)) return false;
      return true;
    });
    list = list.slice().sort((a, b) => {
      switch (sort) {
        case 'recent': return b.created_at.localeCompare(a.created_at);
        case 'oldest': return a.created_at.localeCompare(b.created_at);
        case 'title': return a.title.localeCompare(b.title);
        case 'reels': return b.counts.reel_script - a.counts.reel_script;
        case 'total': return b.counts.total - a.counts.total;
      }
    });
    return list;
  }, [docsEnriched, search, sort, subjectFilter]);

  async function onDelete(doc: DocSummary) {
    if (!userId) return;
    if (!window.confirm(`Delete "${doc.title}"? This removes the document and all generated content.`)) return;
    setBusyId(doc.id);
    try {
      await deleteDocument(doc.id, userId);
      setDocs((ds) => ds.filter((d) => d.id !== doc.id));
      const s = await fetchStats(userId);
      setStats(s);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onRegenerate(doc: DocSummary) {
    if (!userId) return;
    if (!window.confirm(`Regenerate reels & cards for "${doc.title}"? This replaces all existing generated content.`)) return;
    setBusyId(doc.id);
    try {
      await regenerateDocument(doc.id, userId);
      // Optimistically mark as generating; the underlying counts won't update
      // until the worker finishes. The user can refresh later.
      setDocs((ds) =>
        ds.map((d) => (d.id === doc.id ? { ...d, status: 'generating' } : d)),
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!userId) return <Empty msg="Sign in to see your dashboard." />;
  if (err) return <Empty msg={err} />;
  if (!analytics || !stats) return <Empty msg="Loading…" />;

  return (
    <div className="mx-auto max-w-4xl space-y-7 p-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your dashboard</h1>
          <p className="text-xs text-muted">Track your library and learning progress.</p>
        </div>
        {gamify && (
          <div className="text-right text-xs text-muted">
            <div className="text-sm font-semibold text-white">{gamify.xp_total.toLocaleString()} XP</div>
            <div>🔥 {gamify.streak}-day streak</div>
          </div>
        )}
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Uploads" value={stats.total_uploads} />
        <StatTile label="Reels made" value={stats.total_reels} />
        <StatTile label="Watch time" value={fmtDuration(stats.seconds_watched)} />
        <StatTile
          label="Quizzes"
          value={stats.quizzes_completed}
          sub={stats.quizzes_completed ? `${pct(stats.quizzes_correct, stats.quizzes_completed)}% correct` : undefined}
        />
        <StatTile label="XP" value={gamify?.xp_total.toLocaleString() ?? '–'} />
        <StatTile label="Streak" value={`${gamify?.streak ?? 0}d`} />
      </section>

      <Section title="Your library" right={<Link to="/upload" className="text-xs text-accent hover:underline">Upload more →</Link>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="min-w-[180px] flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm placeholder:text-white/40 focus:border-accent focus:outline-none"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs"
          >
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">A → Z</option>
            <option value="reels">Most reels</option>
            <option value="total">Most content</option>
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value as Subject | 'all')}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs"
          >
            <option value="all">All subjects</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {filteredDocs.length === 0 ? (
          docs.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted">No documents match those filters.</p>
          )
        ) : (
          <ul className="space-y-2">
            {filteredDocs.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                busy={busyId === d.id}
                onDelete={() => onDelete(d)}
                onRegenerate={() => onRegenerate(d)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="XP — last 14 days">
        <Sparkline points={analytics.xp_series.map((p) => p.xp)} labels={analytics.xp_series.map((p) => p.date.slice(5))} />
      </Section>

      <Section title="Activity">
        <Sparkline
          points={analytics.activity_series.map((p) => p.events)}
          labels={analytics.activity_series.map((p) => p.date.slice(5))}
          stroke="#9aa3b2"
        />
      </Section>

      <Section title="Mastery heatmap">
        <Heatmap rows={analytics.mastery} />
      </Section>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-widest text-white/55">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-white/55">{sub}</div>}
    </div>
  );
}

function DocRow({
  doc,
  busy,
  onDelete,
  onRegenerate,
}: {
  doc: DocSummary & { subject: Subject };
  busy: boolean;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const date = new Date(doc.created_at).toLocaleDateString();
  const statusTone =
    doc.status === 'ready' ? 'bg-emerald-500/15 text-emerald-300'
    : doc.status === 'error' ? 'bg-rose-500/15 text-rose-300'
    : 'bg-amber-500/15 text-amber-200';

  return (
    <li className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link to={`/doc/${encodeURIComponent(doc.id)}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/65">{doc.subject}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${statusTone}`}>{doc.status}</span>
            <span className="text-[10px] text-white/45">· {date}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold hover:underline">{doc.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/65 tabular-nums">
            <span>{doc.counts.reel_script} reels</span>
            <span>{doc.counts.flashcard} flashcards</span>
            <span>{doc.counts.quiz} quizzes</span>
            <span>{doc.counts.swipe_card} cards</span>
          </div>
          {doc.error && (
            <p className="mt-1 text-[11px] text-rose-300">{doc.error}</p>
          )}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/doc/${encodeURIComponent(doc.id)}`}
            className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-semibold text-white hover:bg-accent/25"
          >
            Open hub
          </Link>
          <button
            disabled={busy}
            onClick={onRegenerate}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
          >
            {busy ? '…' : 'Regenerate'}
          </button>
          <button
            disabled={busy}
            onClick={onDelete}
            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function EmptyLibrary() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
      <p className="mb-3 text-sm text-muted">No uploads yet.</p>
      <Link to="/upload" className="inline-block rounded-full bg-accent px-4 py-2 text-sm text-white">
        Upload your first document
      </Link>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">{title}</h2>
        {right}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">{children}</div>
    </section>
  );
}

function Sparkline({ points, labels, stroke = '#7c5cff' }: {
  points: number[]; labels: string[]; stroke?: string;
}) {
  const w = 480; const h = 120; const pad = 8;
  const max = Math.max(1, ...points);
  const path = useMemo(() => {
    if (!points.length) return '';
    const stepX = (w - pad * 2) / Math.max(1, points.length - 1);
    return points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * stepX} ${pad + (h - pad * 2) * (1 - v / max)}`)
      .join(' ');
  }, [points, max]);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
        <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{labels[0]}</span><span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function Heatmap({ rows }: { rows: MasteryRow[] }) {
  if (!rows.length) {
    return <p className="text-muted text-sm">Answer a few quiz items to populate this.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.concept_id} className="flex items-center gap-3">
          <span className="flex-1 truncate text-sm">{r.name}</span>
          <div className="w-32 h-2 bg-white/10 rounded overflow-hidden">
            <div
              className="h-full"
              style={{ width: `${Math.round(r.score * 100)}%`, background: barColor(r.score) }}
            />
          </div>
          <span className="text-xs text-muted w-9 text-right">{Math.round(r.score * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

function barColor(score: number): string {
  if (score >= 0.7) return '#34d399';
  if (score >= 0.4) return '#facc15';
  return '#f87171';
}

function Empty({ msg }: { msg: string }) {
  return <div className="p-8 text-center text-muted">{msg}</div>;
}

function fmtDuration(seconds: number): string {
  if (!seconds) return '0m';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}
