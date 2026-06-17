const BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000';

export type IngestStatus =
  | 'uploaded'
  | 'parsing'
  | 'embedding'
  | 'generating'
  | 'ready_for_generation'
  | 'ready'
  | 'error';

export interface StatusEvent {
  status: IngestStatus;
  error?: string | null;
}

export function subscribeStatus(
  docId: string,
  onEvent: (e: StatusEvent) => void,
  onDone?: (final: StatusEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/api/ingest/${encodeURIComponent(docId)}/status`);
  const terminal = new Set<IngestStatus>(['ready', 'ready_for_generation', 'error']);

  es.onmessage = (ev) => {
    try {
      const data: StatusEvent = JSON.parse(ev.data);
      onEvent(data);
      if (terminal.has(data.status)) {
        es.close();
        onDone?.(data);
      }
    } catch {
      /* ignore non-JSON heartbeats */
    }
  };
  es.onerror = () => {
    es.close();
    onDone?.({ status: 'error', error: 'connection lost' });
  };
  return () => es.close();
}
