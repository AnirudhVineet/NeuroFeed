import { api } from './api';
import { supabase } from './supabase';
import type { ReelScript } from '../../../../packages/shared-types/artifacts';

// Direct-message client. Server REST for read/write; Supabase Realtime channel
// for live inserts (RLS-filtered on the server side, so the browser only
// receives messages it could read anyway).

export type MessageKind = 'text' | 'reel_share';

export interface PeerLite {
  user_id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
}

export interface SharedArtifact {
  id: string;
  document_id: string;
  type: string;
  payload: ReelScript | Record<string, unknown>;
  document_title?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  artifact_id: string | null;
  artifact?: SharedArtifact | null;
  created_at: string;
  read_at: string | null;
}

export interface ConversationSummary {
  id: string;
  peer: PeerLite;
  last_message: Message | null;
  unread_count: number;
  last_message_at: string;
  created_at: string;
}

export async function listConversations(userId: string) {
  return api<{ items: ConversationSummary[] }>(
    `/api/messages/conversations?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function openConversation(userId: string, peerId: string) {
  return api<{ id: string }>(`/api/messages/conversations`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, peer_id: peerId }),
  });
}

export async function listMessages(
  convId: string,
  userId: string,
  opts: { limit?: number; before?: string } = {},
) {
  const p = new URLSearchParams({ user_id: userId });
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.before) p.set('before', opts.before);
  return api<{ items: Message[] }>(
    `/api/messages/${encodeURIComponent(convId)}?${p.toString()}`,
  );
}

export async function sendTextMessage(convId: string, userId: string, body: string) {
  return api<Message>(`/api/messages/${encodeURIComponent(convId)}`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, kind: 'text', body }),
  });
}

export async function shareReelMessage(
  convId: string,
  userId: string,
  artifactId: string,
) {
  return api<Message>(`/api/messages/${encodeURIComponent(convId)}`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, kind: 'reel_share', artifact_id: artifactId }),
  });
}

export async function markConversationRead(convId: string, userId: string) {
  return api<{ ok: string }>(`/api/messages/${encodeURIComponent(convId)}/read`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

/** Subscribe to new messages inserted into a conversation. Returns an
 * unsubscribe function. The Supabase channel is filtered server-side by RLS,
 * so the browser only receives rows it can read.
 *
 * Note: reel_share messages arrive without the hydrated `artifact` field —
 * callers should re-fetch via listMessages, or do a per-row artifact lookup.
 */
export function subscribeToConversation(
  convId: string,
  onInsert: (row: Message) => void,
): () => void {
  const channel = supabase
    .channel(`messages:conv:${convId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convId}`,
      },
      (payload) => {
        const row = payload.new as Message;
        if (row && row.conversation_id === convId) onInsert(row);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
