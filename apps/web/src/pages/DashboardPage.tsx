import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAnalytics, type AnalyticsPayload, type MasteryRow } from '@/lib/analytics';
import { useGamify } from '@/state/gamify';

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const gamify = useGamify((s) => s.state);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try {
        setData(await fetchAnalytics(uid));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (!userId) return <Empty msg="Sign in to see your stats." />;
  if (err) return <Empty msg={err} />;
  if (!data) return <Empty msg="Loading…" />;

  return (
    <div className="p-4 space-y-6 max-w-xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your progress</h1>
        {gamify && (
          <div className="text-right text-xs text-muted">
            <div>{gamify.xp_total.toLocaleString()} XP total</div>
            <div>🔥 {gamify.streak}-day streak</div>
          </div>
        )}
      </header>

      <Section title="XP — last 14 days">
        <Sparkline points={data.xp_series.map((p) => p.xp)} labels={data.xp_series.map((p) => p.date.slice(5))} />
      </Section>

      <Section title="Activity">
        <Sparkline
          points={data.activity_series.map((p) => p.events)}
          labels={data.activity_series.map((p) => p.date.slice(5))}
          stroke="#9aa3b2"
        />
      </Section>

      <Section title="Mastery heatmap">
        <Heatmap rows={data.mastery} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-widest text-muted mb-2">{title}</h2>
      <div className="rounded-2xl bg-white/5 border border-white/10 p-3">{children}</div>
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
