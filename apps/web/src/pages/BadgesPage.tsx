import { useEffect, useState } from 'react';
import { fetchDocuments, fetchStats, type DashboardStats, type DocSummary } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';
import { useGamify } from '@/state/gamify';
import { BADGE_CATALOG } from '@/lib/roster';
import { SocialChips } from '@/components/social/SocialChips';

interface BadgeProgress {
  key: string;
  earned: boolean;
  pct: number;
  hint: string;
}

export default function BadgesPage() {
  const gamify = useGamify((s) => s.state);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const [d, s] = await Promise.all([fetchDocuments(uid), fetchStats(uid)]);
      setDocs(d.items);
      setStats(s);
    })();
  }, []);

  const items: BadgeProgress[] = [
    {
      key: '30_day_streak',
      earned: (gamify?.streak ?? 0) >= 30,
      pct: Math.min(100, ((gamify?.streak ?? 0) / 30) * 100),
      hint: `${gamify?.streak ?? 0} / 30 days`,
    },
    {
      key: 'quiz_master',
      earned: (stats?.quizzes_correct ?? 0) >= 25,
      pct: Math.min(100, ((stats?.quizzes_correct ?? 0) / 25) * 100),
      hint: `${stats?.quizzes_correct ?? 0} / 25 correct answers`,
    },
    {
      key: 'networking_expert',
      earned: docs.filter((d) => /network/i.test(d.title)).length >= 3,
      pct: Math.min(100, (docs.filter((d) => /network/i.test(d.title)).length / 3) * 100),
      hint: `${docs.filter((d) => /network/i.test(d.title)).length} / 3 networking documents`,
    },
    {
      key: '100_reels',
      earned: (stats?.reels_watched ?? 0) >= 100,
      pct: Math.min(100, ((stats?.reels_watched ?? 0) / 100) * 100),
      hint: `${stats?.reels_watched ?? 0} / 100 reels watched`,
    },
    {
      key: '10_uploads',
      earned: (stats?.total_uploads ?? 0) >= 10,
      pct: Math.min(100, ((stats?.total_uploads ?? 0) / 10) * 100),
      hint: `${stats?.total_uploads ?? 0} / 10 uploads`,
    },
    {
      key: 'flashcard_champ',
      earned: false,
      pct: 0,
      hint: 'Review 500 flashcards (tracker coming soon)',
    },
    {
      key: 'perfect_quiz',
      earned: !!gamify?.achievements?.includes('quiz_25'),
      pct: gamify?.achievements?.includes('quiz_25') ? 100 : 40,
      hint: 'Get every question right in a quiz',
    },
    {
      key: 'early_adopter',
      earned: true,
      pct: 100,
      hint: 'You joined NeuroFeed during the beta.',
    },
  ];

  const earned = items.filter((i) => i.earned);
  const locked = items.filter((i) => !i.earned);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-24">
      <SocialChips />
      <header>
        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Achievements</p>
        <h1 className="text-2xl font-bold text-on-surface">Badges</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {earned.length} / {items.length} earned. Earn more by studying daily and winning quizzes.
        </p>
      </header>

      <section className="mt-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Earned</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {earned.map((b) => <BadgeCard key={b.key} bp={b} />)}
          {!earned.length && <li className="col-span-full rounded-2xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">No badges yet.</li>}
        </ul>
      </section>

      <section className="mt-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">In progress</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {locked.map((b) => <BadgeCard key={b.key} bp={b} />)}
        </ul>
      </section>
    </div>
  );
}

function BadgeCard({ bp }: { bp: BadgeProgress }) {
  const meta = BADGE_CATALOG[bp.key];
  if (!meta) return null;
  return (
    <li
      className={`relative overflow-hidden rounded-2xl border p-4 ${
        bp.earned ? 'border-amber-400/30 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-rose-500/15 shadow-glow' : 'border-outline-variant bg-surface-container-lowest opacity-90'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`text-3xl ${bp.earned ? '' : 'grayscale opacity-60'}`}>{meta.glyph}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">{meta.label}</p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">{meta.description}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full bg-gradient-to-r from-primary via-secondary to-accent"
          style={{ width: `${bp.pct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-on-surface-variant">{bp.hint}</p>
    </li>
  );
}
