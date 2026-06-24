import { Link, useLocation } from 'react-router-dom';

const LINKS: { to: string; label: string; icon: string }[] = [
  { to: '/discover', label: 'Discover', icon: 'search' },
  { to: '/friends', label: 'Friends', icon: 'group' },
  { to: '/activity', label: 'Activity', icon: 'history' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { to: '/badges', label: 'Badges', icon: 'military_tech' },
];

export function SocialChips() {
  const { pathname } = useLocation();
  return (
    <nav className="mb-md flex flex-wrap gap-1.5">
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.to);
        return (
          <Link
            key={l.to}
            to={l.to}
            className={
              active
                ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-container px-3 py-1.5 text-label-sm font-bold text-on-primary-container'
                : 'inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high'
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden>
              {l.icon}
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
