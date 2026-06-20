import { api } from './api';
import type {
  Flashcard,
  QuizItem,
  ReelScript,
  SwipeCard,
  Summary,
} from '../../../../packages/shared-types/artifacts';

export type ArtifactType =
  | 'summary'
  | 'swipe_card'
  | 'flashcard'
  | 'quiz'
  | 'reel_script'
  | 'learning_path_step';

export interface FeedItem {
  id: string;
  document_id: string;
  document_title?: string;
  concept_id: string | null;
  type: ArtifactType;
  payload: SwipeCard | Flashcard | QuizItem | ReelScript | Summary | Record<string, unknown>;
  score: number;
  reason: Record<string, number>;
  created_at: string;
}

export async function fetchFeed(userId: string, limit = 30) {
  return api<{ items: FeedItem[] }>(`/api/feed?user_id=${encodeURIComponent(userId)}&limit=${limit}`);
}

export async function postEvent(userId: string, type: string, payload: Record<string, unknown> = {}) {
  return api<{ ok: string }>('/api/events', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, type, payload }),
  });
}

export type InterestKind = 'interested' | 'not_interested';

export async function postInterest(
  userId: string,
  kind: InterestKind,
  payload: { artifact_id?: string; document_id?: string | null; concept_id?: string | null },
) {
  // Strip nulls so the payload stays compact server-side.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v != null) cleaned[k] = v;
  }
  return postEvent(userId, kind, cleaned);
}

export async function explainSimpler(artifactId: string, userId?: string) {
  return api<{ title: string; body: string }>('/api/explain-simpler', {
    method: 'POST',
    body: JSON.stringify({ artifact_id: artifactId, user_id: userId }),
  });
}

export async function quizByConcept(conceptId: string) {
  return api<{ items: { id: string; payload: QuizItem }[] }>(
    `/api/quiz/by-concept/${encodeURIComponent(conceptId)}`,
  );
}
