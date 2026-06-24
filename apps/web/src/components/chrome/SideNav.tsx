import { Link, useLocation } from 'react-router-dom';

// Desktop left sidebar (>= md). On mobile, BottomNav takes over.
// Five primary destinations: Home, Explore, Create, Challenges, Profile.
// Active state matches a prefix cluster so nested sub-routes light up the
// right tab (e.g. /u/:username highlights Profile).

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
  { to: '/challenge', label: 'Challenges', icon: 'emoji_events', matches: (p) => p.startsWith('/challenge') },
  { to: '/profile', label: 'Profile', icon: 'account_circle', matches: (p) => isProfile(p) },
];

export function SideNav() {
  const { pathname } = useLocation();
  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-outline-variant bg-surface py-md md:flex"
      aria-label="Primary"
    >
      <Link
        to="/"
        className="mb-4 px-md py-lg text-headline-md font-bold tracking-tight text-primary"
      >
        NeuroFeed
      </Link>
      <nav className="flex-1 space-y-2 px-sm">
        {TABS.map((t) => {
          const active = t.matches(pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex items-center gap-base rounded-lg bg-surface-container px-md py-sm font-bold text-primary'
                  : 'flex items-center gap-base rounded-lg px-md py-sm text-on-surface-variant transition-all hover:bg-surface-container'
              }
            >
              <span
                className="material-symbols-outlined"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {t.icon}
              </span>
              <span className="text-label-md">{t.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-md pt-md">
        <Link
          to="/profile"
          className="flex items-center gap-base rounded-xl bg-tertiary-fixed p-sm text-on-tertiary-fixed transition-all hover:brightness-95"
        >
          <span className="material-symbols-outlined" aria-hidden>school</span>
          <div className="min-w-0 overflow-hidden">
            <p className="truncate text-label-sm font-bold">Your Learning</p>
            <p className="text-[10px] opacity-70">View profile · stats</p>
          </div>
        </Link>
      </div>
    </aside>
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
