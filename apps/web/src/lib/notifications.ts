// Notifications store — polls /api/notifications every 8s while the user is
// signed in, pushes new rows into an in-memory list, and emits "fresh" rows
// to subscribers so the toast host can pop them up.

import { useSyncExternalStore } from 'react';
import { api } from './api';
import { supabase } from './supabase';

export type NotificationKind =
  | 'follow'
  | 'friend_request'
  | 'friend_accept'
  | 'challenge_request'
  | 'challenge_accepted'
  | 'challenge_declined'
  | 'challenge_finished';

export interface NotificationActor {
  user_id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  kind: NotificationKind;
  challenge_id: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
  actor?: NotificationActor | null;
}

interface NotifState {
  ready: boolean;
  items: NotificationRow[];
  unread: number;
}

const EMPTY: NotifState = { ready: false, items: [], unread: 0 };

let state: NotifState = EMPTY;
const listeners = new Set<() => void>();
const freshListeners = new Set<(row: NotificationRow) => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function useNotifications(): NotifState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

/** Subscribe to "new" notifications (created since the last poll). The toast
 * host uses this to pop up an ephemeral card without rerendering the list. */
export function onFreshNotification(fn: (row: NotificationRow) => void): () => void {
  freshListeners.add(fn);
  return () => freshListeners.delete(fn);
}

function set(patch: Partial<NotifState>) {
  state = { ...state, ...patch };
  emit();
}

let pollHandle: number | null = null;
let currentUserId: string | null = null;
let lastSeen: string | null = null;

async function pollOnce() {
  if (!currentUserId) return;
  try {
    const r = await api<{ items: NotificationRow[]; unread: number }>(
      `/api/notifications?user_id=${encodeURIComponent(currentUserId)}&limit=50`,
    );
    const items = r.items ?? [];
    // Detect freshly-arrived rows so we can fire toast popups.
    if (lastSeen) {
      for (const n of items) {
        if (n.created_at > lastSeen && !n.read) {
          for (const fn of freshListeners) fn(n);
        }
      }
    }
    if (items.length) lastSeen = items[0].created_at;
    set({ ready: true, items, unread: r.unread ?? 0 });
  } catch {
    // Soft-fail: keep prior list.
    set({ ready: true });
  }
}

function startTimer() {
  if (pollHandle !== null) return;
  pollHandle = window.setInterval(() => {
    void pollOnce();
  }, 8000);
}

function stopTimer() {
  if (pollHandle === null) return;
  window.clearInterval(pollHandle);
  pollHandle = null;
}

let visibilityWired = false;
function ensureVisibilityWired() {
  if (visibilityWired || typeof document === 'undefined') return;
  visibilityWired = true;
  document.addEventListener('visibilitychange', () => {
    if (!currentUserId) return;
    if (document.hidden) {
      stopTimer();
    } else {
      void pollOnce();
      startTimer();
    }
  });
}

export function startNotifications(userId: string) {
  if (currentUserId === userId && pollHandle !== null) return;
  stopNotifications();
  currentUserId = userId;
  lastSeen = null;
  ensureVisibilityWired();
  void pollOnce();
  if (typeof document === 'undefined' || !document.hidden) startTimer();
}

export function stopNotifications() {
  currentUserId = null;
  lastSeen = null;
  stopTimer();
  state = EMPTY;
  emit();
}

/** Convenience hook: wires the store to the current supabase session. */
export function useNotificationsBootstrap(): void {
  if (typeof window === 'undefined') return;
  // Run once on first import — synchronous side effect since this module is
  // imported once.
}

// Auto-wire on module load.
if (typeof window !== 'undefined') {
  void (async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (uid) startNotifications(uid);
  })();
  supabase.auth.onAuthStateChange((_evt, session) => {
    const uid = session?.user.id;
    if (uid) startNotifications(uid);
    else stopNotifications();
  });
}

export async function markRead(id: string) {
  if (!currentUserId) return;
  try {
    await api(`/api/notifications/${encodeURIComponent(id)}/read?user_id=${encodeURIComponent(currentUserId)}`, {
      method: 'POST',
    });
  } catch {
    // Best-effort
  }
  set({
    items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    unread: Math.max(0, state.unread - 1),
  });
}

export async function markAllRead() {
  if (!currentUserId) return;
  try {
    await api(`/api/notifications/read-all?user_id=${encodeURIComponent(currentUserId)}`, {
      method: 'POST',
    });
  } catch {
    // Best-effort
  }
  set({ items: state.items.map((n) => ({ ...n, read: true })), unread: 0 });
}

/** Hand-build a friendly message for a notification (toast + center). */
export function notificationCopy(n: NotificationRow): { title: string; body: string } {
  const who = n.actor?.username ? `@${n.actor.username}` : 'Someone';
  switch (n.kind) {
    case 'follow':
      return { title: `${who} followed you`, body: 'Tap to view their profile.' };
    case 'friend_request':
      return { title: `${who} sent a friend request`, body: 'Accept or decline below.' };
    case 'friend_accept':
      return { title: `${who} accepted your friend request`, body: "You're now friends." };
    case 'challenge_request':
      return {
        title: `${who} challenged you to a quiz battle`,
        body: (n.payload?.subject as string | undefined) ?? 'Tap to accept or decline.',
      };
    case 'challenge_accepted':
      return { title: `${who} accepted your challenge`, body: 'The match is starting.' };
    case 'challenge_declined':
      return { title: `${who} declined your challenge`, body: 'Maybe next time.' };
    case 'challenge_finished': {
      const wf = Number(n.payload?.wins_from ?? 0);
      const wt = Number(n.payload?.wins_to ?? 0);
      return { title: `Match with ${who} ended`, body: `Final: ${wf} – ${wt}` };
    }
    default:
      return { title: 'New notification', body: '' };
  }
}
