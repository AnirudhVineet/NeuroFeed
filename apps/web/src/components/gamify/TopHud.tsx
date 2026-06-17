import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useGamify } from '@/state/gamify';

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

  if (!state) return null;
  const pct = Math.min(1, state.daily_goal_pct);
  return (
    <div className="fixed top-2 left-2 right-2 z-30 flex items-center gap-3 pointer-events-none">
      <GoalRing pct={pct} />
      <div className="flex-1">
        <div className="text-xs text-white/70">XP {state.xp_total.toLocaleString()}</div>
        <div className="h-1 mt-1 bg-white/10 rounded overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <div className="text-sm bg-black/40 backdrop-blur rounded-full px-2 py-1 border border-white/10">
        🔥 {state.streak}
      </div>
    </div>
  );
}

function GoalRing({ pct }: { pct: number }) {
  const R = 14;
  const C = 2 * Math.PI * R;
  return (
    <svg width={36} height={36} viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={R} stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" />
      <circle
        cx="18" cy="18" r={R}
        stroke="#7c5cff" strokeWidth="3" fill="none" strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - pct)}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
