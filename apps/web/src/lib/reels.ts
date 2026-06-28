import { api } from './api';

// Reel engagement client (likes + comments) for Global Feed.
// Only used on public reels — engagement endpoints reject non-public artifacts
// on the server, so the UI can render the buttons optimistically.

export interface EngagementSummary {
  like_count: number;
  comment_count: number;
  has_liked: boolean;
}

export interface CommentAuthor {
  user_id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
}

export interface ReelComment {
  id: string;
  artifact_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: CommentAuthor;
}

export async function fetchEngagement(artifactId: string, userId: string | null) {
  const p = new URLSearchParams();
  if (userId) p.set('user_id', userId);
  return api<EngagementSummary>(
    `/api/reels/${encodeURIComponent(artifactId)}/engagement?${p.toString()}`,
  );
}

export async function likeReel(artifactId: string, userId: string) {
  return api<{ ok: string; liked: true }>(
    `/api/reels/${encodeURIComponent(artifactId)}/likes`,
    {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    },
  );
}

export async function unlikeReel(artifactId: string, userId: string) {
  return api<{ ok: string; liked: false }>(
    `/api/reels/${encodeURIComponent(artifactId)}/likes?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export async function listComments(artifactId: string, limit = 100) {
  return api<{ items: ReelComment[] }>(
    `/api/reels/${encodeURIComponent(artifactId)}/comments?limit=${limit}`,
  );
}

export async function postComment(
  artifactId: string,
  userId: string,
  body: string,
) {
  return api<ReelComment>(
    `/api/reels/${encodeURIComponent(artifactId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, body }),
    },
  );
}

export async function deleteComment(commentId: string, userId: string) {
  return api<{ ok: string }>(
    `/api/reels/comments/${encodeURIComponent(commentId)}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}
