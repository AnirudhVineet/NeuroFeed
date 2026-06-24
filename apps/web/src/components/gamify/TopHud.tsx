import { useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useGamify } from '@/state/gamify';
import { NotificationBell } from '@/components/social/NotificationBell';

// Sticky status bar with goal ring, XP progress, and streak.
// Sits at the very top with safe-area padding so it never overlaps the
// reel progress bar (which now sits below the HUD).
export function TopHud() {
  const state = useGamify((s) => s.state);
  const fetchFor = useGamify((s) => s.fetchFor);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) void fetchFor(uid);
    })();
  }, [fetchFor]);

  const pct = state ? Math.min(1, state.daily_goal_pct) : 0;
  const level = useMemo(() => (state ? levelFromXp(state.xp_total) : null), [state]);

  if (!state) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <div
        className="mx-auto max-w-2xl px-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <div className="pointer-events-auto glass-strong flex items-center gap-3 rounded-2xl px-3 py-2 shadow-soft">
          <GoalRing pct={pct} level={level?.tier ?? 1} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">XP</span>
              <span className="text-sm font-semibold tabular-nums text-white">
                {state.xp_total.toLocaleString()}
              </span>
              <span className="ml-auto text-[10px] tabular-nums text-white/45">
                {state.xp_today}/{state.daily_goal_xp} today
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent shadow-glow"
                style={{
                  width: `${pct * 100}%`,
                  transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs">
            <span aria-hidden className="text-base leading-none">🔥</span>
            <span className="font-bold tabular-nums text-white">{state.streak}</span>
          </div>
          <NotificationBell />
        </div>
      </div>
    </div>
  );
}

function GoalRing({ pct, level }: { pct: number; level: number }) {
  const R = 16;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-10 w-10 shrink-0">
      <svg width={40} height={40} viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={R} stroke="rgba(255,255,255,0.10)" strokeWidth="3" fill="none" />
        <defs>
          <linearGradient id="hud-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
        <circle
          cx="20"
          cy="20"
          r={R}
          stroke="url(#hud-ring)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white">
        L{level}
      </span>
    </div>
  );
}

function levelFromXp(xp: number): { tier: number } {
  // Cheap level curve: every 250 XP. Caps at 99 for display sanity.
  return { tier: Math.min(99, Math.max(1, 1 + Math.floor(xp / 250))) };
}
