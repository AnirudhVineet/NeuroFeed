import { Link, useLocation } from 'react-router-dom';

// Mobile-only bottom nav (hidden md+; SideNav takes over there). Same five
// destinations as SideNav so the IA is identical across breakpoints.

interface Tab {
  to: string;
  label: string;
  icon: string;
  matches: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: 'home', matches: (p) => p === '/' || p.startsWith('/doc/') },
  { to: '/discover', label: 'Explore', icon: 'search', matches: (p) => isExplore(p) },
  { to: '/upload', label: 'Create', icon: 'add_box', matches: (p) => p.startsWith('/upload') },
  { to: '/challenge', label: 'Play', icon: 'emoji_events', matches: (p) => p.startsWith('/challenge') },
  { to: '/profile', label: 'You', icon: 'account_circle', matches: (p) => isProfile(p) },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="glass-strong dark:glass-dark fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant dark:border-white/10 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((t) => {
          const active = t.matches(pathname);
          return (
            <li key={t.to} className="flex-1">
              <Link
                to={t.to}
                aria-current={active ? 'page' : undefined}
                aria-label={t.label}
                className={
                  active
                    ? 'flex flex-col items-center gap-0.5 py-2 text-primary dark:text-white'
                    : 'flex flex-col items-center gap-0.5 py-2 text-on-surface-variant dark:text-white/50 transition-colors hover:text-on-surface dark:hover:text-white'
                }
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '24px',
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  }}
                >
                  {t.icon}
                </span>
                <span className="text-[10px] font-semibold">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function isExplore(p: string): boolean {
  return (
    p.startsWith('/discover') ||
    p.startsWith('/friends') ||
    p.startsWith('/leaderboard') ||
    p.startsWith('/activity')
  );
}

function isProfile(p: string): boolean {
  return (
    p.startsWith('/profile') ||
    p.startsWith('/u/') ||
    p.startsWith('/dashboard') ||
    p.startsWith('/badges') ||
    p.startsWith('/settings')
  );
}
