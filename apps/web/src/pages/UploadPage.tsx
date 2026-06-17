import { useRef, useState } from 'react';
import { uploadAndIngest } from '@/lib/upload';
import { subscribeStatus, type IngestStatus } from '@/lib/ingestStatus';

const ACCEPT = '.pdf,.docx,.pptx,.mp3,.m4a,.wav,.ogg,.webm,.flac,.txt,.md';

const STEPS: IngestStatus[] = [
  'uploaded',
  'parsing',
  'embedding',
  'ready_for_generation',
];

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setStatus('uploaded');
    setBusy(true);
    try {
      const res = await uploadAndIngest(file);
      setDocId(res.document_id);
      subscribeStatus(res.document_id, (e) => {
        setStatus(e.status);
        if (e.error) setError(e.error);
      }, () => setBusy(false));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Upload</h1>
      <p className="text-muted mb-6">
        PDF, DOCX, PPTX, or lecture audio. We'll parse, chunk, and embed it.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent bg-white/5' : 'border-white/20 hover:border-white/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="text-muted">
          {busy ? 'Working…' : 'Drag a file here, or tap to choose'}
        </div>
        <div className="text-xs text-muted mt-2">{ACCEPT.split(',').join(' · ')}</div>
      </label>

      {status && (
        <div className="mt-6">
          <StatusTimeline current={status} />
          {docId && <p className="text-xs text-muted mt-3">doc id: {docId}</p>}
          {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}

function StatusTimeline({ current }: { current: IngestStatus }) {
  const reached = (s: IngestStatus) =>
    STEPS.indexOf(s) <= STEPS.indexOf(current) || current === 'ready' || current === 'error';
  return (
    <ol className="space-y-2">
      {STEPS.map((s) => (
        <li key={s} className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${reached(s) ? 'bg-accent' : 'bg-white/20'}`}
          />
          <span className={reached(s) ? '' : 'text-muted'}>{labelFor(s)}</span>
        </li>
      ))}
    </ol>
  );
}

function labelFor(s: IngestStatus) {
  switch (s) {
    case 'uploaded':
      return 'Uploaded';
    case 'parsing':
      return 'Parsing document';
    case 'embedding':
      return 'Embedding chunks';
    case 'ready_for_generation':
      return 'Ready for generation';
    case 'generating':
      return 'Generating';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
  }
}
