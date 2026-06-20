import { Link, useLocation } from 'react-router-dom';
import type { SVGProps } from 'react';

interface Tab {
  to: string;
  label: string;
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
}

const TABS: Tab[] = [
  { to: '/', label: 'Feed', Icon: FeedIcon },
  { to: '/upload', label: 'Upload', Icon: UploadIcon },
  { to: '/tutor', label: 'Tutor', Icon: TutorIcon },
  { to: '/dashboard', label: 'You', Icon: YouIcon },
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
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
      >
        <div className="glass-strong flex items-center justify-between gap-1 rounded-full p-1.5 shadow-soft-lg">
          {TABS.map((t) => {
            const active = isActive(pathname, t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-300 ease-out ${
                  active
                    ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                <t.Icon
                  className={`h-[18px] w-[18px] transition-transform duration-300 ${
                    active ? 'scale-105' : 'group-hover:scale-105'
                  }`}
                />
                <span
                  className={`overflow-hidden transition-[max-width,opacity] duration-300 ${
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

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

function TutorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-12.1 6.86L4 20l1.2-4.4A8 8 0 1 1 21 12Z" />
      <path d="M9 11h.01" />
      <path d="M13 11h.01" />
      <path d="M17 11h.01" />
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
