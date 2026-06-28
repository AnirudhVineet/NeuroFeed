import { supabase } from './supabase';
import { api } from './api';
import type { Visibility } from './social';

const BUCKET = 'uploads';

export interface IngestResponse {
  document_id: string;
  status: string;
}

export async function uploadAndIngest(
  file: File,
  opts: { title?: string; visibility?: Visibility } = {},
): Promise<IngestResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Sign in to upload.');

  const key = `${userId}/${crypto.randomUUID()}-${sanitize(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  return api<IngestResponse>('/api/ingest', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      title: opts.title ?? file.name,
      storage_path: `${BUCKET}/${key}`,
      filename: file.name,
      content_type: file.type || null,
      visibility: opts.visibility ?? 'private',
    }),
  });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
