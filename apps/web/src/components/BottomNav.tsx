import { Link, useLocation } from 'react-router-dom';
import type { SVGProps } from 'react';

interface Tab {
  to: string;
  label: string;
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
  // Returns true when the current location should highlight this tab — used
  // for routes whose canonical href doesn't appear in pathname (e.g. /paths
  // counts as part of the Learn cluster).
  matches?: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Feed', Icon: FeedIcon, matches: (p) => p === '/' },
  { to: '/paths', label: 'Learn', Icon: PathIcon, matches: (p) => p.startsWith('/paths') || p.startsWith('/doc') },
  { to: '/upload', label: 'Upload', Icon: UploadIcon, matches: (p) => p.startsWith('/upload') },
  { to: '/discover', label: 'Social', Icon: SocialIcon, matches: (p) => isSocial(p) },
  { to: '/profile', label: 'You', Icon: YouIcon, matches: (p) => p.startsWith('/profile') || p.startsWith('/u/') || p.startsWith('/dashboard') || p.startsWith('/settings') },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
      aria-label="Primary"
    >
      <div
        className="pointer-events-auto w-full max-w-md px-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
      >
        <div className="glass-strong flex items-center justify-between gap-1 rounded-full p-1 shadow-soft-lg sm:p-1.5">
          {TABS.map((t) => {
            const active = t.matches ? t.matches(pathname) : isActive(pathname, t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? 'page' : undefined}
                aria-label={t.label}
                className={`group relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-xs font-semibold transition-all duration-300 ease-out sm:px-3 sm:py-2 ${
                  active
                    ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                <t.Icon
                  className={`h-[22px] w-[22px] transition-transform duration-300 sm:h-[18px] sm:w-[18px] ${
                    active ? 'scale-105' : 'group-hover:scale-105'
                  }`}
                />
                <span
                  className={`hidden overflow-hidden transition-[max-width,opacity] duration-300 sm:inline ${
                    active ? 'max-w-[5rem] opacity-100' : 'max-w-0 opacity-0 sm:max-w-[5rem] sm:opacity-100'
                  }`}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

function isSocial(p: string): boolean {
  return (
    p.startsWith('/discover') ||
    p.startsWith('/friends') ||
    p.startsWith('/activity') ||
    p.startsWith('/leaderboard') ||
    p.startsWith('/badges') ||
    p.startsWith('/challenge')
  );
}

function FeedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
      <circle cx="19" cy="6" r="1.5" fill="currentColor" />
      <circle cx="19" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PathIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19c0-3 3-4 7-4s7-1 7-4" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="11" r="2" />
      <circle cx="12" cy="5" r="2" />
    </svg>
  );
}

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

function SocialIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3.5" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M14 17a4 4 0 0 1 7 0" />
    </svg>
  );
}

function YouIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
