import { Link, useLocation } from 'react-router-dom';

const LINKS: { to: string; label: string; glyph: string }[] = [
  { to: '/discover', label: 'Discover', glyph: '🔭' },
  { to: '/friends', label: 'Friends', glyph: '👥' },
  { to: '/activity', label: 'Activity', glyph: '⏱' },
  { to: '/leaderboard', label: 'Leaderboard', glyph: '🏆' },
  { to: '/badges', label: 'Badges', glyph: '🏅' },
];

export function SocialChips() {
  const { pathname } = useLocation();
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5">
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.to);
        return (
          <Link
            key={l.to}
            to={l.to}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
                : 'border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/10'
            }`}
          >
            <span aria-hidden>{l.glyph}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
