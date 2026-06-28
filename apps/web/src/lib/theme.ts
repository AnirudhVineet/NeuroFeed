// Theme state: light / dark / system. Persisted to localStorage; on first
// load we follow the user's OS preference when `system` is chosen.
//
// The actual color swap happens via a `.dark` class on <html>. Tailwind's
// `darkMode: 'class'` and the CSS variables in index.css do the rest, so
// no component needs to know about themes — they write semantic tokens
// (`bg-surface text-on-surface`) and the variables resolve correctly.
//
// To avoid FOUC on initial paint, main.tsx runs `applyResolvedTheme()`
// synchronously before React mounts.

import { useEffect, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'neurofeed:theme';

function readPref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage unavailable (private mode, etc.) — fall through */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

/** Apply the resolved theme to <html> by toggling the `.dark` class. */
function applyToDom(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // Help native form controls (scrollbars, autofill, etc.) match.
  root.style.colorScheme = resolved;
}

/** Synchronous initializer — call once before React mounts to avoid FOUC. */
export function applyResolvedTheme(): ResolvedTheme {
  const pref = readPref();
  const resolved = resolveTheme(pref);
  applyToDom(resolved);
  return resolved;
}

// ---------------- External store (for useSyncExternalStore) ----------------

let currentPref: ThemePref = readPref();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribePref(fn: () => void): () => void {
  listeners.add(fn);
  // Also re-emit when the OS preference flips, so `system` followers update.
  const mq =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  const onChange = () => {
    if (currentPref === 'system') {
      applyToDom(resolveTheme('system'));
      emit();
    }
  };
  mq?.addEventListener?.('change', onChange);
  return () => {
    listeners.delete(fn);
    mq?.removeEventListener?.('change', onChange);
  };
}

function getPref(): ThemePref {
  return currentPref;
}

export function setTheme(pref: ThemePref): void {
  currentPref = pref;
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  applyToDom(resolveTheme(pref));
  emit();
}

/** React hook — returns the current preference and a setter. */
export function useTheme(): { pref: ThemePref; resolved: ResolvedTheme; setTheme: (p: ThemePref) => void } {
  const pref = useSyncExternalStore(subscribePref, getPref, getPref);
  // resolved derives from pref + system. We compute it fresh each render so
  // an OS-level flip is reflected on the next paint without a separate store.
  const resolved = resolveTheme(pref);
  return { pref, resolved, setTheme };
}

/** Convenience: bind the OS media query so it re-applies whenever it changes,
 *  even outside any React tree (e.g. background tabs). Safe to call once at
 *  app boot. */
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (currentPref === 'system') applyToDom(resolveTheme('system'));
  };
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}

/** Hook variant of the watcher — call once near the root if you prefer hook
 *  lifecycles to a manual cleanup. Idempotent. */
export function useSystemThemeWatcher(): void {
  useEffect(() => watchSystemTheme(), []);
}
