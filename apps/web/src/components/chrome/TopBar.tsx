import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGamify } from '@/state/gamify';
import { NotificationBell } from '@/components/social/NotificationBell';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';

// Sticky top bar: search (centred), then a streak chip + notification bell on
// the right. Replaces the old floating TopHud — gamification visibility
// shrinks to a streak chip here; XP + goal ring live on the Profile dashboard
// (T5). Hidden on auth routes (toggled in App.tsx).
export function TopBar() {
  const navigate = useNavigate();
  const streak = useGamify((s) => s.state?.streak ?? 0);
  const [q, setQ] = useState('');

  // Sync local input from the URL when navigating into /discover?q=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qs = params.get('q');
    if (qs) setQ(qs);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/discover?q=${encodeURIComponent(term)}`);
  }

  return (
    <header
      className="glass dark:glass-dark sticky top-0 z-30 w-full border-b border-outline-variant/30 dark:border-white/10"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex h-16 max-w-container-max items-center gap-md px-md">
        <form onSubmit={onSubmit} className="group relative max-w-xl flex-1">
          <span
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-white/40 transition-colors group-focus-within:text-primary dark:group-focus-within:text-white"
            aria-hidden
          >
            search
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search topics, creators, or study reels…"
            className="w-full rounded-full border-none bg-surface-container dark:bg-white/5 py-2 pl-12 pr-4 text-body-sm dark:text-white placeholder:text-outline dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:focus:ring-primary/45"
          />
        </form>
        <div className="flex shrink-0 items-center gap-sm">
          {streak > 0 && (
            <div
              className="flex items-center gap-xs rounded-full border border-outline-variant dark:border-white/10 bg-surface-container dark:bg-white/[0.04] px-3 py-1.5 text-label-sm"
              title={`${streak}-day streak`}
              aria-label={`${streak} day streak`}
            >
              <span aria-hidden>🔥</span>
              <span className="font-bold tabular-nums text-on-surface dark:text-white">{streak}</span>
            </div>
          )}
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
