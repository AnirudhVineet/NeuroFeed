import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadAndIngest } from '@/lib/upload';
import { subscribeStatus, type IngestStatus } from '@/lib/ingestStatus';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';

const ACCEPT = '.pdf,.docx,.pptx,.mp3,.m4a,.wav,.ogg,.webm,.flac,.txt,.md';

const FORMAT_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Docs', items: ['PDF', 'DOCX', 'PPTX'] },
  { label: 'Audio', items: ['MP3', 'M4A', 'WAV', 'OGG', 'FLAC'] },
  { label: 'Text', items: ['TXT', 'MD'] },
];

const STEPS: IngestStatus[] = [
  'uploaded',
  'parsing',
  'embedding',
  'generating',
  'ready',
];

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [recent, setRecent] = useState<DocSummary[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        try {
          const res = await fetchDocuments(uid);
          setRecent(res.items.slice(0, 5));
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  async function handleFile(file: File) {
    setError(null);
    setStatus('uploaded');
    setBusy(true);
    setFileName(file.name);
    try {
      const res = await uploadAndIngest(file);
      setDocId(res.document_id);
      subscribeStatus(
        res.document_id,
        (e) => {
          setStatus(e.status);
          if (e.error) setError(e.error);
        },
        () => {
          setBusy(false);
          if (userId) {
            void fetchDocuments(userId).then((r) => setRecent(r.items.slice(0, 5)));
          }
        },
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-24">
      <header className="mb-6 text-center">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-white">
          Upload your material
        </h1>
        <p className="mt-2 text-balance text-sm text-white/55">
          Drop in a PDF, lecture audio, or notes. We'll parse, chunk, and turn it into reels,
          flashcards, and quizzes.
        </p>
      </header>

      <section className="relative">
        <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-brand-soft opacity-60 blur-2xl" />
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
          className={`group relative block cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-10 text-center shadow-soft transition-all duration-300 ${
            dragOver
              ? 'scale-[1.01] border-primary bg-primary/10 shadow-glow'
              : 'border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]'
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

          <div className="flex flex-col items-center gap-4">
            <DropIcon active={dragOver || busy} />
            <div>
              <p className="text-base font-semibold text-white">
                {busy ? 'Processing your file…' : dragOver ? 'Drop to upload' : 'Drag & drop or click to choose'}
              </p>
              <p className="mt-1 text-xs text-white/55">
                Up to ~50 MB · single file at a time
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {FORMAT_GROUPS.flatMap((g) => g.items).map((fmt) => (
                <span
                  key={fmt}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/65"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </label>
      </section>

      {(status || error) && (
        <section className="mt-6 rounded-3xl border border-white/10 bg-card/80 p-5 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/55">Now processing</p>
              <p className="truncate text-sm font-semibold text-white">{fileName ?? 'Your file'}</p>
            </div>
            {status && (
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusTone(
                  status,
                )}`}
              >
                {status === 'ready' ? 'Ready' : status === 'error' ? 'Error' : 'Working'}
              </span>
            )}
          </div>
          {status && <StatusTimeline current={status} />}
          {docId && status === 'ready' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/"
                className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-4 py-2 text-xs font-semibold text-white shadow-glow"
              >
                Open feed →
              </Link>
              <Link
                to={`/doc/${encodeURIComponent(docId)}`}
                className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/10"
              >
                Open Chapter Hub
              </Link>
            </div>
          )}
          {error && (
            <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-2.5 text-sm text-rose-200">
              {error}
            </p>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-widest text-white/55">Recent uploads</h2>
            <Link to="/dashboard" className="text-xs text-white/55 hover:text-white">
              See all →
            </Link>
          </div>
          <ul className="space-y-2">
            {recent.map((d) => (
              <li
                key={d.id}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-soft"
              >
                <Link to={`/doc/${encodeURIComponent(d.id)}`} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 text-base">
                    {iconFor(d.source_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{d.title}</p>
                    <p className="text-[11px] text-white/50">
                      {new Date(d.created_at).toLocaleDateString()} ·{' '}
                      {d.counts.total} items
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${statusTone(
                      d.status as IngestStatus,
                    )}`}
                  >
                    {d.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DropIcon({ active }: { active: boolean }) {
  return (
    <div
      className={`relative flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-300 ${
        active
          ? 'bg-gradient-to-br from-primary/40 via-secondary/30 to-accent/40 shadow-glow'
          : 'bg-white/[0.04]'
      }`}
    >
      <svg
        className={`h-9 w-9 text-white transition-transform duration-300 ${active ? '-translate-y-0.5' : 'group-hover:-translate-y-0.5'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 17V5" />
        <path d="m6 11 6-6 6 6" />
        <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
      </svg>
    </div>
  );
}

function StatusTimeline({ current }: { current: IngestStatus }) {
  const currentIdx = STEPS.indexOf(current);
  return (
    <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-white/10">
      {STEPS.map((s) => {
        const idx = STEPS.indexOf(s);
        const reached = idx <= currentIdx || current === 'ready';
        const isCurrent = s === current && current !== 'ready' && current !== 'error';
        return (
          <li key={s} className="relative flex items-center gap-3">
            <span
              className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
                reached
                  ? 'bg-gradient-to-br from-primary to-accent shadow-glow'
                  : 'bg-white/10'
              }`}
            >
              {isCurrent && (
                <span className="absolute inset-0 -m-0.5 animate-ping rounded-full bg-accent/40" />
              )}
              {reached && !isCurrent && (
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            <span className={`text-sm ${reached ? 'text-white' : 'text-white/45'}`}>
              {labelFor(s)}
            </span>
          </li>
        );
      })}
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
      return 'Generating reels & cards';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
  }
}

function statusTone(s: IngestStatus): string {
  if (s === 'ready') return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200';
  if (s === 'error') return 'border-rose-400/30 bg-rose-500/15 text-rose-200';
  return 'border-amber-400/30 bg-amber-500/15 text-amber-100';
}

function iconFor(sourceType: string): string {
  if (/audio/i.test(sourceType)) return '🎧';
  if (/pdf/i.test(sourceType)) return '📕';
  if (/doc|docx/i.test(sourceType)) return '📄';
  if (/ppt|pptx/i.test(sourceType)) return '📊';
  if (/md|markdown|txt/i.test(sourceType)) return '📝';
  return '📁';
}
