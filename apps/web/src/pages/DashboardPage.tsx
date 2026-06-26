import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [subjectFilter, setSubjectFilter] = useState<Subject | 'all'>('all');
  const gamify = useGamify((s) => s.state);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const uid = session?.user.id ?? null;
      setUserId(uid);
      setEmail(session?.user.email ?? null);
      setCreatedAt(session?.user.created_at ?? null);
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

  async function onSignOut() {
    if (!window.confirm('Sign out of NeuroFeed?')) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningOut(false);
    }
  }

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

  // Dark canvas comes from App.tsx (route is in DARK_PAGE_PREFIXES).
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-4 pb-32 pt-24">
      {/* Profile header */}
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/60 p-5 shadow-soft">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-brand-gradient opacity-25 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-50 blur-md" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent text-xl font-bold uppercase text-white shadow-glow">
                {(email ?? '?').slice(0, 1)}
              </div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">
                {email ?? 'Unknown'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                {createdAt && (
                  <span>Joined {new Date(createdAt).toLocaleDateString()}</span>
                )}
                {gamify && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5">
                    <span aria-hidden>🔥</span>
                    <span className="font-semibold text-white">{gamify.streak}</span>
                    <span className="text-white/55">day streak</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/profile"
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/10"
            >
              View profile
            </Link>
            <Link
              to="/settings/privacy"
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs text-white/75 hover:bg-white/10"
            >
              Privacy
            </Link>
            <button
              onClick={onSignOut}
              disabled={signingOut}
              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
        <SocialQuickRow />
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile glyph="📤" label="Uploads" value={stats.total_uploads} />
        <StatTile glyph="🎬" label="Reels made" value={stats.total_reels} />
        <StatTile glyph="⏱" label="Watch time" value={fmtDuration(stats.seconds_watched)} />
        <StatTile
          glyph="❓"
          label="Quizzes"
          value={stats.quizzes_completed}
          sub={stats.quizzes_completed ? `${pct(stats.quizzes_correct, stats.quizzes_completed)}% correct` : undefined}
        />
        <StatTile glyph="✨" label="XP" value={gamify?.xp_total.toLocaleString() ?? '–'} accent />
        <StatTile glyph="🔥" label="Streak" value={`${gamify?.streak ?? 0}d`} accent />
      </section>

      {/* Library */}
      <Section
        title="Your library"
        right={
          <Link to="/upload" className="text-xs font-semibold text-primary hover:underline">
            Upload more →
          </Link>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search documents…" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-white outline-none transition-colors hover:bg-white/[0.08] focus:border-primary"
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
            className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-white outline-none transition-colors hover:bg-white/[0.08] focus:border-primary"
          >
            <option value="all">All subjects</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {filteredDocs.length === 0 ? (
          docs.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <p className="px-3 py-8 text-center text-sm text-white/55">No documents match those filters.</p>
          )
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredDocs.map((d) => (
              <DocCard
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

function SocialQuickRow() {
  const links: { to: string; glyph: string; label: string }[] = [
    { to: '/discover', glyph: '🔭', label: 'Discover' },
    { to: '/friends', glyph: '👥', label: 'Friends' },
    { to: '/activity', glyph: '⏱', label: 'Activity' },
    { to: '/leaderboard', glyph: '🏆', label: 'Leaderboard' },
    { to: '/badges', glyph: '🏅', label: 'Badges' },
  ];
  return (
    <div className="relative mt-4 flex flex-wrap gap-1.5">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
        >
          <span aria-hidden>{l.glyph}</span>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-[180px] flex-1">
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-white/10 bg-white/[0.04] py-2 pl-9 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-primary"
      />
    </div>
  );
}

function StatTile({
  glyph,
  label,
  value,
  sub,
  accent = false,
}: {
  glyph: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-soft transition-all hover:-translate-y-0.5 ${
        accent
          ? 'border-primary/30 bg-gradient-to-br from-primary/15 via-secondary/10 to-accent/15'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-white/55">{label}</div>
        <span className="text-base leading-none opacity-80">{glyph}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums leading-none text-white">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-white/55">{sub}</div>}
    </div>
  );
}

function DocCard({
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
    doc.status === 'ready' ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
    : doc.status === 'error' ? 'border-rose-400/30 bg-rose-500/15 text-rose-200'
    : 'border-amber-400/30 bg-amber-500/15 text-amber-100';

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow">
      <Link to={`/doc/${encodeURIComponent(doc.id)}`} className="block">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/75">
            {doc.subject}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${statusTone}`}>
            {doc.status}
          </span>
          <span className="ml-auto text-[10px] text-white/45">{date}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white">{doc.title}</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <CountBadge label="reels" value={doc.counts.reel_script} />
          <CountBadge label="cards" value={doc.counts.flashcard} />
          <CountBadge label="quizzes" value={doc.counts.quiz} />
        </div>
        {doc.error && (
          <p className="mt-2 text-[11px] text-rose-300">{doc.error}</p>
        )}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Link
          to={`/doc/${encodeURIComponent(doc.id)}`}
          className="flex-1 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-3 py-1.5 text-center text-xs font-semibold text-white shadow-glow"
        >
          Open Hub
        </Link>
        <button
          disabled={busy}
          onClick={onRegenerate}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? '…' : 'Regenerate'}
        </button>
        <button
          disabled={busy}
          onClick={onDelete}
          aria-label="Delete document"
          className="rounded-full border border-rose-400/30 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="m19 6-1.4 14a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] py-1.5">
      <div className="text-sm font-bold tabular-nums leading-none text-white">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/45">{label}</div>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 text-2xl">
        📚
      </div>
      <p className="mb-4 text-sm text-white/65">No uploads yet.</p>
      <Link
        to="/upload"
        className="inline-flex rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow"
      >
        Upload your first document
      </Link>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/55">{title}</h2>
        {right}
      </div>
      <div className="rounded-3xl border border-white/10 bg-card/40 p-4 shadow-soft">{children}</div>
    </section>
  );
}

function Sparkline({ points, labels, stroke = '#A855F7' }: {
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
  const areaPath = useMemo(() => {
    if (!path) return '';
    const last = pad + (w - pad * 2);
    return `${path} L ${last} ${h - pad} L ${pad} ${h - pad} Z`;
  }, [path]);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full">
        <defs>
          <linearGradient id="spark-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#spark-area)" />
        <path d={path} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-white/45">
        <span>{labels[0]}</span><span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function Heatmap({ rows }: { rows: MasteryRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-white/55">Answer a few quiz items to populate this.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.concept_id} className="flex items-center gap-3">
          <span className="flex-1 truncate text-sm text-white/90">{r.name}</span>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full transition-all"
              style={{ width: `${Math.round(r.score * 100)}%`, background: barColor(r.score) }}
            />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-white/55">{Math.round(r.score * 100)}%</span>
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
  return <div className="px-8 pb-32 pt-32 text-center text-white/55">{msg}</div>;
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
