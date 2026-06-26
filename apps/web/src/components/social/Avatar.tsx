import { Link } from 'react-router-dom';

// Deterministic gradient avatar — same seed always renders the same hue
// pair. Linkable: clicking opens the profile (Section 6: "tapping any avatar
// should open that profile").

interface AvatarProps {
  seed: string;
  size?: number;
  username?: string;
  label?: string;
  online?: boolean;
  linkTo?: string | false;
  className?: string;
}

export function Avatar({
  seed,
  size = 40,
  username,
  label,
  online,
  linkTo,
  className,
}: AvatarProps) {
  const initial = (label ?? username ?? seed ?? '?').slice(0, 1).toUpperCase();
  const { from, to } = hues(seed || username || 'x');
  const fontSize = Math.max(10, Math.round(size * 0.42));
  const ringSize = Math.max(6, Math.round(size * 0.22));

  const inner = (
    <span
      className={`relative inline-flex items-center justify-center rounded-full font-bold uppercase text-white shadow-soft ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        fontSize,
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
      aria-label={username ? `${username}'s avatar` : undefined}
    >
      {initial}
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background bg-emerald-400"
          style={{ width: ringSize, height: ringSize }}
        />
      )}
    </span>
  );

  const target = linkTo === false ? null : linkTo ?? (username ? `/u/${encodeURIComponent(username)}` : null);
  if (!target) return inner;
  return (
    <Link to={target} className="inline-flex shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/60">
      {inner}
    </Link>
  );
}

function hues(seed: string): { from: string; to: string } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const h1 = Math.abs(h) % 360;
  const h2 = (h1 + 47 + (Math.abs(h >> 8) % 60)) % 360;
  return { from: `hsl(${h1} 78% 55%)`, to: `hsl(${h2} 78% 45%)` };
}
