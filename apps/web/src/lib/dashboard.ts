import { api } from './api';
import type { ArtifactType } from './feed';
import type { Visibility } from './social';

export interface DocCounts {
  summary: number;
  swipe_card: number;
  flashcard: number;
  quiz: number;
  reel_script: number;
  total: number;
}

export interface DocSummary {
  id: string;
  title: string;
  status: string;
  source_type: string;
  created_at: string;
  error: string | null;
  // Server may omit `visibility` for legacy rows; treat absence as 'private'.
  visibility?: Visibility | null;
  // True when the owner removed the doc from My Feed without deleting. The
  // dashboard still shows the card (with a Hidden badge + Unhide action).
  hidden_from_owner?: boolean;
  counts: DocCounts;
}

export interface DashboardStats {
  total_uploads: number;
  total_reels: number;
  reels_watched: number;
  seconds_watched: number;
  quizzes_completed: number;
  quizzes_correct: number;
}

export async function fetchDocuments(userId: string) {
  return api<{ items: DocSummary[] }>(
    `/api/documents?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function fetchStats(userId: string) {
  return api<DashboardStats>(
    `/api/analytics/stats?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function deleteDocument(docId: string, userId: string) {
  return api<{ ok: string }>(
    `/api/documents/${encodeURIComponent(docId)}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export interface DocumentPatch {
  hidden_from_owner?: boolean;
  visibility?: Visibility;
}

/** Owner-only patch: toggle `hidden_from_owner` and/or change `visibility`
 * without touching artifacts. Used by the delete-modal "Remove from My Feed"
 * and "Unpublish" options, and by the dashboard Unhide button. */
export async function updateDocument(
  docId: string,
  userId: string,
  patch: DocumentPatch,
) {
  return api<{ ok: string; updated: DocumentPatch }>(
    `/api/documents/${encodeURIComponent(docId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ user_id: userId, ...patch }),
    },
  );
}

export async function regenerateDocument(docId: string, userId: string) {
  return api<{ ok: string }>(
    `/api/documents/${encodeURIComponent(docId)}/regenerate?user_id=${encodeURIComponent(userId)}`,
    { method: 'POST' },
  );
}

export function artifactLabel(t: ArtifactType): string {
  switch (t) {
    case 'reel_script': return 'reels';
    case 'swipe_card': return 'cards';
    case 'flashcard': return 'flashcards';
    case 'quiz': return 'quizzes';
    case 'summary': return 'summary';
    default: return t;
  }
}
