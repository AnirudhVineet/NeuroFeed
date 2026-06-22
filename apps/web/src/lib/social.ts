// API-backed social store. Replaces the previous localStorage-only stub —
// every mutation now hits the FastAPI backend (which writes to Postgres via
// Supabase RLS). The same `useSocial()` snapshot shape is preserved so all
// existing components keep working without changes.
//
// The store keeps an in-memory snapshot of the current user's social state
// (profile, follows, friends, requests, challenges, bookmarks, doc
// visibility, path progress, privacy, activity). It hydrates on `bootstrap()`
// (called once the user is signed in) and refetches the relevant slice after
// each mutation. Components subscribe via `useSyncExternalStore`.

import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { supabase } from './supabase';

export type Visibility = 'private' | 'friends' | 'public';

export interface ProfileMeta {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  pronouns: string;
  college: string;
  subjects: string[];
  avatar_seed: string;
  is_public: boolean;
  hidden_activity: boolean;
  xp: number;
  streak: number;
  followers_count: number;
  following_count: number;
  uploads_count: number;
  achievements: string[];
}

export interface PrivacySettings {
  profile: Visibility;
  uploads: Visibility;
  followers: Visibility;
  activity: Visibility;
  quiz_records: Visibility;
  achievements: Visibility;
  leaderboard: boolean;
}

export interface ProfileLite {
  user_id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
  college?: string | null;
  subjects?: string[] | null;
}

export interface FriendRequest {
  id: string;
  from?: ProfileLite;
  to?: ProfileLite;
  from_user?: string;
  to_user?: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled';
  created_at: string;
}

export interface Challenge {
  id: string;
  from_user: string;
  to_user: string;
  from?: ProfileLite;
  to?: ProfileLite;
  mode: '1v1' | 'timed' | 'random' | 'document' | 'chapter';
  document_id?: string | null;
  chapter?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'finished';
  wins_from?: number | null;
  wins_to?: number | null;
  created_at: string;
  finished_at?: string | null;
}

export interface ActivityRow {
  id: string;
  actor: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_seed: string;
  verb: string;
  object_text: string;
  ts: string;
  hidden?: boolean;
}

export interface PathProgressRow {
  user_id: string;
  document_id: string;
  step_order: number;
  status: 'not_started' | 'in_progress' | 'completed';
  pct: number;
  completed_at?: string | null;
  updated_at: string;
}

export interface SocialState {
  ready: boolean;
  user_id: string | null;
  profile: ProfileMeta | null;
  privacy: PrivacySettings;
  following: ProfileLite[];
  friends: ProfileLite[];
  friend_requests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  challenges: Challenge[];
  activity: ActivityRow[];
  doc_visibility: Record<string, Visibility>;
  path_progress: Record<string, PathProgressRow>; // key = `${docId}:${order}`
  bookmarks: string[];
}

const DEFAULT_PRIVACY: PrivacySettings = {
  profile: 'public',
  uploads: 'public',
  followers: 'public',
  activity: 'public',
  quiz_records: 'public',
  achievements: 'public',
  leaderboard: true,
};

const EMPTY_STATE: SocialState = {
  ready: false,
  user_id: null,
  profile: null,
  privacy: DEFAULT_PRIVACY,
  following: [],
  friends: [],
  friend_requests: { incoming: [], outgoing: [] },
  challenges: [],
  activity: [],
  doc_visibility: {},
  path_progress: {},
  bookmarks: [],
};

let state: SocialState = EMPTY_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function get(): SocialState {
  return state;
}

function set(patch: Partial<SocialState>) {
  state = { ...state, ...patch };
  emit();
}

export function useSocial(): SocialState {
  return useSyncExternalStore(subscribe, get, get);
}

// ============================================================
// Bootstrap / hydration
// ============================================================

let bootstrapping: Promise<void> | null = null;

export async function bootstrap(userId: string, opts: { force?: boolean } = {}): Promise<void> {
  // Re-bootstrap if forced, or if the previous attempt left us without a
  // profile (happens when the backend was 500-ing during the first try).
  const needsRefetch = opts.force || (state.user_id === userId && state.ready && state.profile === null);
  if (state.user_id === userId && state.ready && !needsRefetch) return;
  if (bootstrapping) return bootstrapping;
  bootstrapping = doBootstrap(userId).finally(() => {
    bootstrapping = null;
  });
  return bootstrapping;
}

async function doBootstrap(userId: string): Promise<void> {
  set({ user_id: userId, ready: false });
  const [profile, privacy, following, friends, requests, challenges, activity, docVis, path, bookmarks] =
    await Promise.all([
      api<ProfileMeta>(`/api/profiles/me?user_id=${encodeURIComponent(userId)}`).catch(() => null),
      api<Partial<PrivacySettings>>(`/api/privacy?user_id=${encodeURIComponent(userId)}`).catch(() => ({})),
      api<{ items: ProfileLite[] }>(`/api/follows/following?user_id=${encodeURIComponent(userId)}`).catch(() => ({ items: [] })),
      api<{ items: ProfileLite[] }>(`/api/friends?user_id=${encodeURIComponent(userId)}`).catch(() => ({ items: [] })),
      api<{ items: { incoming: FriendRequest[]; outgoing: FriendRequest[] } }>(
        `/api/friends/requests?user_id=${encodeURIComponent(userId)}`,
      ).catch(() => ({ items: { incoming: [], outgoing: [] } })),
      api<{ items: Challenge[] }>(`/api/challenges?user_id=${encodeURIComponent(userId)}`).catch(() => ({ items: [] })),
      api<{ items: ActivityRow[] }>(`/api/activity?user_id=${encodeURIComponent(userId)}&scope=all`).catch(() => ({ items: [] })),
      api<{ items: Record<string, Visibility> }>(`/api/doc-visibility?user_id=${encodeURIComponent(userId)}`).catch(() => ({ items: {} })),
      api<{ items: PathProgressRow[] }>(`/api/path-progress?user_id=${encodeURIComponent(userId)}`).catch(() => ({ items: [] })),
      api<{ items: { artifact_id: string }[] }>(`/api/bookmarks?user_id=${encodeURIComponent(userId)}`).catch(() => ({ items: [] })),
    ]);

  const pathMap: Record<string, PathProgressRow> = {};
  for (const r of path.items ?? []) {
    pathMap[`${r.document_id}:${r.step_order}`] = r;
  }

  // Defensive: when the backend returns the safe-read fallback (an empty
  // profile shape with user_id=""), pretend we got nothing so the UI shows the
  // "not synced" path instead of rendering "@" with no username.
  const validProfile = profile && profile.user_id ? profile : null;

  set({
    ready: true,
    user_id: userId,
    profile: validProfile,
    privacy: { ...DEFAULT_PRIVACY, ...privacy },
    following: following.items ?? [],
    friends: friends.items ?? [],
    friend_requests: requests.items ?? { incoming: [], outgoing: [] },
    challenges: challenges.items ?? [],
    activity: activity.items ?? [],
    doc_visibility: docVis.items ?? {},
    path_progress: pathMap,
    bookmarks: (bookmarks.items ?? []).map((b) => b.artifact_id),
  });
}

export function reset(): void {
  state = { ...EMPTY_STATE };
  emit();
}

// React helper: hydrate when the current Supabase session is known. Safe to
// call multiple times.
export function useSocialBootstrap(): void {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (cancelled) return;
      if (!uid) {
        reset();
        return;
      }
      await bootstrap(uid);
    })();
    const sub = supabase.auth.onAuthStateChange((_evt, session) => {
      const uid = session?.user.id ?? null;
      if (!uid) reset();
      else void bootstrap(uid);
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);
}

// ============================================================
// Mutations
// ============================================================

function uid(): string {
  if (!state.user_id) throw new Error('not signed in');
  return state.user_id;
}

export async function patchProfile(p: Partial<ProfileMeta>): Promise<void> {
  const body = JSON.stringify(p);
  const res = await api<ProfileMeta>(
    `/api/profiles/me?user_id=${encodeURIComponent(uid())}`,
    { method: 'PATCH', body },
  );
  set({ profile: res });
}

export async function patchPrivacy(p: Partial<PrivacySettings>): Promise<void> {
  const res = await api<PrivacySettings>(
    `/api/privacy?user_id=${encodeURIComponent(uid())}`,
    { method: 'PUT', body: JSON.stringify(p) },
  );
  set({ privacy: { ...DEFAULT_PRIVACY, ...res } });
}

export async function toggleActivityHidden(): Promise<void> {
  const prof = state.profile;
  if (!prof) return;
  const next = !prof.hidden_activity;
  await patchProfile({ hidden_activity: next });
}

// ---- Follow ----

export function isFollowing(username: string): boolean {
  return state.following.some((u) => u.username === username);
}

export async function toggleFollow(username: string): Promise<boolean> {
  const has = isFollowing(username);
  if (has) {
    await api(`/api/follows/${encodeURIComponent(username)}?user_id=${encodeURIComponent(uid())}`, {
      method: 'DELETE',
    });
    set({ following: state.following.filter((u) => u.username !== username) });
    return false;
  }
  await api(`/api/follows?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
    body: JSON.stringify({ followee_username: username }),
  });
  // Refresh just the following list
  const r = await api<{ items: ProfileLite[] }>(`/api/follows/following?user_id=${encodeURIComponent(uid())}`);
  set({ following: r.items });
  void refreshActivity();
  return true;
}

// ---- Friends ----

export function isFriend(username: string): boolean {
  return state.friends.some((u) => u.username === username);
}

export async function sendFriendRequest(toUsername: string): Promise<void> {
  await api(`/api/friends/requests?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
    body: JSON.stringify({ to_username: toUsername }),
  });
  await refreshFriendsAndRequests();
}

export async function acceptFriendRequest(id: string): Promise<void> {
  await api(`/api/friends/requests/${encodeURIComponent(id)}/accept?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
  });
  await refreshFriendsAndRequests();
  void refreshActivity();
}

export async function declineFriendRequest(id: string): Promise<void> {
  await api(`/api/friends/requests/${encodeURIComponent(id)}/decline?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
  });
  await refreshFriendsAndRequests();
}

async function refreshFriendsAndRequests() {
  const [friends, requests] = await Promise.all([
    api<{ items: ProfileLite[] }>(`/api/friends?user_id=${encodeURIComponent(uid())}`),
    api<{ items: { incoming: FriendRequest[]; outgoing: FriendRequest[] } }>(
      `/api/friends/requests?user_id=${encodeURIComponent(uid())}`,
    ),
  ]);
  set({
    friends: friends.items,
    friend_requests: requests.items ?? { incoming: [], outgoing: [] },
  });
}

// ---- Challenges ----

export async function challenge(opts: {
  to: string;
  mode: Challenge['mode'];
  doc_id?: string | null;
  chapter?: string | null;
}): Promise<Challenge> {
  const r = await api<{ challenge: Challenge }>(`/api/challenges?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
    body: JSON.stringify({
      to_username: opts.to,
      mode: opts.mode,
      document_id: opts.doc_id ?? null,
      chapter: opts.chapter ?? null,
    }),
  });
  await refreshChallenges();
  return r.challenge;
}

export async function finishChallenge(id: string, wins_from: number, wins_to: number): Promise<void> {
  await api(`/api/challenges/${encodeURIComponent(id)}/finish?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
    body: JSON.stringify({ wins_from, wins_to }),
  });
  await refreshChallenges();
  void refreshActivity();
}

async function refreshChallenges() {
  const r = await api<{ items: Challenge[] }>(`/api/challenges?user_id=${encodeURIComponent(uid())}`);
  set({ challenges: r.items });
}

// ---- Doc visibility ----

export function getDocVisibility(docId: string): Visibility {
  return state.doc_visibility[docId] ?? state.privacy.uploads;
}

export async function setDocVisibility(docId: string, v: Visibility): Promise<void> {
  await api(`/api/doc-visibility/${encodeURIComponent(docId)}?user_id=${encodeURIComponent(uid())}`, {
    method: 'PUT',
    body: JSON.stringify({ visibility: v }),
  });
  set({ doc_visibility: { ...state.doc_visibility, [docId]: v } });
}

// ---- Path progress ----

export function getPathProgress(docId: string, order: number): { status: 'not_started' | 'in_progress' | 'completed'; pct: number; completed_at?: string | null } {
  const row = state.path_progress[`${docId}:${order}`];
  if (!row) return { status: 'not_started', pct: 0 };
  return { status: row.status, pct: row.pct, completed_at: row.completed_at };
}

export async function setPathProgress(
  docId: string,
  order: number,
  patch: { status?: 'not_started' | 'in_progress' | 'completed'; pct?: number; completed_at?: string },
): Promise<void> {
  const key = `${docId}:${order}`;
  const prev = state.path_progress[key];
  const status = patch.status ?? prev?.status ?? 'in_progress';
  const pct = patch.pct ?? prev?.pct ?? 0;
  await api(`/api/path-progress?user_id=${encodeURIComponent(uid())}`, {
    method: 'PUT',
    body: JSON.stringify({ document_id: docId, step_order: order, status, pct }),
  });
  set({
    path_progress: {
      ...state.path_progress,
      [key]: {
        user_id: state.user_id ?? '',
        document_id: docId,
        step_order: order,
        status,
        pct,
        completed_at: status === 'completed' ? new Date().toISOString() : (prev?.completed_at ?? null),
        updated_at: new Date().toISOString(),
      },
    },
  });
}

// ---- Bookmarks ----

export function isBookmarked(artifactId: string): boolean {
  return state.bookmarks.includes(artifactId);
}

export async function toggleBookmark(artifactId: string): Promise<boolean> {
  const has = isBookmarked(artifactId);
  if (has) {
    await api(`/api/bookmarks/${encodeURIComponent(artifactId)}?user_id=${encodeURIComponent(uid())}`, {
      method: 'DELETE',
    });
    set({ bookmarks: state.bookmarks.filter((id) => id !== artifactId) });
    return false;
  }
  await api(`/api/bookmarks?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
    body: JSON.stringify({ artifact_id: artifactId }),
  });
  set({ bookmarks: [artifactId, ...state.bookmarks] });
  return true;
}

// ---- Activity ----

export async function pushActivity(opts: { actor?: string; verb: string; object: string }): Promise<void> {
  await api(`/api/activity?user_id=${encodeURIComponent(uid())}`, {
    method: 'POST',
    body: JSON.stringify({ verb: opts.verb, object: opts.object }),
  });
  await refreshActivity();
}

async function refreshActivity() {
  if (!state.user_id) return;
  const r = await api<{ items: ActivityRow[] }>(
    `/api/activity?user_id=${encodeURIComponent(state.user_id)}&scope=all`,
  );
  set({ activity: r.items });
}

export async function refreshActivityScope(scope: 'all' | 'mine' | 'following' | 'friends'): Promise<ActivityRow[]> {
  const r = await api<{ items: ActivityRow[] }>(
    `/api/activity?user_id=${encodeURIComponent(uid())}&scope=${scope}`,
  );
  return r.items;
}

// ---- Profile lookups (for /u/:username pages) ----

export async function fetchProfileByUsername(username: string): Promise<ProfileMeta | null> {
  try {
    return await api<ProfileMeta>(`/api/profiles/by-username/${encodeURIComponent(username)}`);
  } catch {
    return null;
  }
}

export async function fetchFollowers(username: string): Promise<ProfileLite[]> {
  const r = await api<{ items: ProfileLite[] }>(
    `/api/follows/followers?username=${encodeURIComponent(username)}`,
  );
  return r.items;
}

export async function fetchDiscover(opts: { subject?: string; q?: string; limit?: number } = {}): Promise<ProfileMeta[]> {
  const params = new URLSearchParams();
  if (state.user_id) params.set('user_id', state.user_id);
  if (opts.subject) params.set('subject', opts.subject);
  if (opts.q) params.set('q', opts.q);
  params.set('limit', String(opts.limit ?? 30));
  const r = await api<{ items: ProfileMeta[] }>(`/api/profiles/discover?${params.toString()}`);
  return r.items;
}

// ---- Global user search (Social page) ----

export interface UserSearchHit extends ProfileMeta {
  level: number;
  mutual_followers_count: number;
  last_active?: string | null;
}

export async function searchUsers(opts: {
  q?: string;
  subject?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<UserSearchHit[]> {
  const params = new URLSearchParams();
  if (state.user_id) params.set('user_id', state.user_id);
  if (opts.q) params.set('q', opts.q);
  if (opts.subject) params.set('subject', opts.subject);
  params.set('limit', String(opts.limit ?? 20));
  params.set('offset', String(opts.offset ?? 0));
  const r = await api<{ items: UserSearchHit[] }>(`/api/users/search?${params.toString()}`);
  return r.items;
}

export interface SuggestedBuckets {
  trending: UserSearchHit[];
  top_streaks: UserSearchHit[];
  recent_uploaders: UserSearchHit[];
  mutual_interests: UserSearchHit[];
}

export async function fetchSuggested(limit = 8): Promise<SuggestedBuckets> {
  const params = new URLSearchParams();
  if (state.user_id) params.set('user_id', state.user_id);
  params.set('limit', String(limit));
  return api<SuggestedBuckets>(`/api/users/suggested?${params.toString()}`);
}

export async function fetchLeaderboard(opts: {
  scope?: 'global' | 'friends' | 'college' | 'subject';
  subject?: string;
  limit?: number;
} = {}): Promise<ProfileMeta[]> {
  const params = new URLSearchParams();
  if (state.user_id) params.set('user_id', state.user_id);
  params.set('scope', opts.scope ?? 'global');
  if (opts.subject) params.set('subject', opts.subject);
  params.set('limit', String(opts.limit ?? 50));
  const r = await api<{ items: ProfileMeta[] }>(`/api/leaderboard?${params.toString()}`);
  return r.items;
}
