import { api } from './api';
import type { ArtifactType } from './feed';

export interface DocCounts {
  summary: number;
  swipe_card: number;
  flashcard: number;
  quiz: number;
  reel_script: number;
  learning_path_step: number;
  total: number;
}

export interface DocSummary {
  id: string;
  title: string;
  status: string;
  source_type: string;
  created_at: string;
  error: string | null;
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
    case 'learning_path_step': return 'steps';
    default: return t;
  }
}
