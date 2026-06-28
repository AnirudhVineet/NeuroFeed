import { useState, useRef, useEffect } from 'react';
import { useTheme, type ThemePref } from '@/lib/theme';

// Compact theme switcher used in the TopBar. Click cycles light → dark → system
// for one-handed quick toggling; the popover lets users pick explicitly.

const OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'system', label: 'System', icon: 'computer' },
];

export function ThemeToggle() {
  const { pref, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerIcon = pref === 'system' ? 'computer' : resolved === 'dark' ? 'dark_mode' : 'light_mode';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Theme: ${pref}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{triggerIcon}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-12 z-40 w-44 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card"
        >
          {OPTIONS.map((opt) => {
            const active = pref === opt.value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { setTheme(opt.value); setOpen(false); }}
                  className={
                    active
                      ? 'flex w-full items-center gap-3 bg-primary-container/40 px-3 py-2 text-left text-label-md font-bold text-on-primary-container'
                      : 'flex w-full items-center gap-3 px-3 py-2 text-left text-label-md text-on-surface transition-colors hover:bg-surface-container-low'
                  }
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{opt.icon}</span>
                  <span className="flex-1">{opt.label}</span>
                  {active && (
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>check</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
