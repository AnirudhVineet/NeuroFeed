import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadAndIngest } from '@/lib/upload';
import { subscribeStatus, type IngestStatus } from '@/lib/ingestStatus';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';
import type { Visibility } from '@/lib/social';
import { VisibilityBadge } from '@/components/social/VisibilityBadge';

const VISIBILITY_OPTS: { id: Visibility; label: string; description: string; icon: string }[] = [
  { id: 'private', label: 'Private', description: 'Only you can see this document and its generated content.', icon: 'lock' },
  { id: 'friends', label: 'Friends', description: 'Only people you have accepted as friends.', icon: 'group' },
  { id: 'public', label: 'Public', description: 'Anyone on NeuroFeed can discover it in the global feed.', icon: 'public' },
];

// Create / Upload hub on the new clinical light theme. Matches the mockup
// `home/create.html` for the drag-drop card + file-type shortcuts + recent
// activity layout. All ingest wiring is preserved from the prior version
// (upload → SSE status stream → refresh recent docs on ready).

const ACCEPT = '.pdf,.docx,.pptx,.mp3,.m4a,.wav,.ogg,.webm,.flac,.txt,.md';

const FILE_SHORTCUTS: { icon: string; color: string; label: string }[] = [
  { icon: 'picture_as_pdf', color: 'text-primary', label: 'Lecture PDF' },
  { icon: 'present_to_all', color: 'text-secondary', label: 'Slide Deck' },
  { icon: 'mic', color: 'text-tertiary', label: 'Audio Note' },
  { icon: 'description', color: 'text-primary', label: 'Notes / DOCX' },
];

const STEPS: IngestStatus[] = ['uploaded', 'parsing', 'embedding', 'generating', 'ready'];

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
  const [visibility, setVisibility] = useState<Visibility>('private');

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        try {
          const res = await fetchDocuments(uid);
          setRecent(res.items.slice(0, 5));
        } catch { /* ignore */ }
      }
    })();
  }, []);

  async function handleFile(file: File) {
    setError(null);
    setStatus('uploaded');
    setBusy(true);
    setFileName(file.name);
    try {
      const res = await uploadAndIngest(file, { visibility });
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
    <div className="mx-auto max-w-4xl px-md py-md">
      {/* Hero / drop card */}
      <section className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card md:p-lg">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary-fixed/30 blur-3xl" />
        <div className="relative">
          <div className="mb-md text-center md:mb-lg">
            <h1 className="mb-2 text-headline-lg text-on-surface">Transform your materials</h1>
            <p className="mx-auto max-w-lg text-body-md text-on-surface-variant">
              Upload any document, presentation, or lecture audio. We parse, chunk, and turn it into
              study reels, flashcards, and quizzes.
            </p>
          </div>

          <div className="mb-md">
            <p className="mb-2 text-label-sm uppercase tracking-widest text-on-surface-variant">
              Who can see this document
            </p>
            <div
              role="radiogroup"
              aria-label="Document visibility"
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {VISIBILITY_OPTS.map((opt) => {
                const active = visibility === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVisibility(opt.id)}
                    className={
                      active
                        ? 'flex items-start gap-3 rounded-xl border-2 border-primary bg-primary-container/30 p-3 text-left transition-colors'
                        : 'flex items-start gap-3 rounded-xl border-2 border-outline-variant bg-surface p-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-container-low'
                    }
                  >
                    <span
                      className={
                        active
                          ? 'material-symbols-outlined text-on-primary-container'
                          : 'material-symbols-outlined text-on-surface-variant'
                      }
                      style={{ fontSize: '20px' }}
                      aria-hidden
                    >
                      {opt.icon}
                    </span>
                    <span className="flex-1">
                      <span
                        className={
                          active
                            ? 'block text-label-md font-bold text-on-primary-container'
                            : 'block text-label-md font-bold text-on-surface'
                        }
                      >
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-label-sm text-on-surface-variant">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={
              dragOver
                ? 'group flex cursor-pointer flex-col items-center gap-md rounded-xl border-2 border-dashed border-primary bg-primary/5 p-xl text-center transition-all'
                : 'group flex cursor-pointer flex-col items-center gap-md rounded-xl border-2 border-dashed border-outline-variant p-xl text-center transition-all hover:border-primary hover:bg-primary/5'
            }
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
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-container text-on-primary-container transition-transform group-hover:scale-110">
              <span className="material-symbols-outlined" style={{ fontSize: '40px' }} aria-hidden>
                cloud_upload
              </span>
            </div>
            <div>
              <p className="text-headline-sm text-on-surface">
                {busy ? 'Processing your file…' : dragOver ? 'Drop to upload' : 'Drag & drop files here'}
              </p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                PDF, PPTX, DOCX, MP3, M4A, WAV, TXT · up to ~50 MB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
              className="rounded-full bg-primary px-lg py-sm text-label-md font-bold text-on-primary shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Browse Files
            </button>
          </label>

          {/* File-type shortcut chips */}
          <div className="mt-md grid grid-cols-2 gap-base md:grid-cols-4">
            {FILE_SHORTCUTS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-sm rounded-xl border border-outline-variant/40 bg-surface-container p-sm transition-colors hover:border-primary/50"
              >
                <span className={`material-symbols-outlined ${s.color}`} aria-hidden>
                  {s.icon}
                </span>
                <span className="text-label-sm font-bold text-on-surface-variant">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Active processing card */}
      {(status || error) && (
        <section className="mt-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <div className="mb-md flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">Now processing</p>
              <p className="truncate text-label-md font-bold text-on-surface">{fileName ?? 'Your file'}</p>
            </div>
            {status && (
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-label-sm font-bold uppercase tracking-widest ${statusTone(status)}`}>
                {status === 'ready' ? 'Ready' : status === 'error' ? 'Error' : 'Working'}
              </span>
            )}
          </div>
          {status && <StatusTimeline current={status} />}
          {docId && status === 'ready' && (
            <div className="mt-md flex flex-wrap gap-2">
              <Link
                to="/"
                className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 text-label-md font-bold text-on-primary-container transition-all hover:brightness-95"
              >
                Open feed
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>arrow_forward</span>
              </Link>
              <Link
                to={`/doc/${encodeURIComponent(docId)}`}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container px-4 py-2 text-label-md font-bold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                Open Chapter Hub
              </Link>
            </div>
          )}
          {error && (
            <p className="mt-md rounded-lg border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container">
              {error}
            </p>
          )}
        </section>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <section className="mt-lg">
          <div className="mb-md flex items-end justify-between">
            <div>
              <h2 className="text-headline-sm text-on-surface">Recent activity</h2>
              <p className="text-body-sm text-on-surface-variant">Track your content generation status</p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
            >
              View history
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden>arrow_forward</span>
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-md md:grid-cols-2">
            {recent.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-outline-variant bg-surface p-md transition-colors hover:border-primary/40"
              >
                <Link to={`/doc/${encodeURIComponent(d.id)}`} className="flex items-start gap-md">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg(d.source_type)}`}>
                    <span className="material-symbols-outlined" aria-hidden>{iconFor(d.source_type)}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-base">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate pr-4 text-label-md font-bold text-on-surface">{d.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusTone(d.status as IngestStatus)}`}>
                        {d.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-label-sm text-on-surface-variant">
                      <VisibilityBadge visibility={d.visibility} />
                      <span>{new Date(d.created_at).toLocaleDateString()} · {d.counts.total} items</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusTimeline({ current }: { current: IngestStatus }) {
  const currentIdx = STEPS.indexOf(current);
  return (
    <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-outline-variant">
      {STEPS.map((s) => {
        const idx = STEPS.indexOf(s);
        const reached = idx <= currentIdx || current === 'ready';
        const isCurrent = s === current && current !== 'ready' && current !== 'error';
        return (
          <li key={s} className="relative flex items-center gap-3">
            <span
              className={
                reached
                  ? 'relative z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary shadow-[0_0_0_3px_rgba(0,106,97,0.18)]'
                  : 'relative z-10 flex h-4 w-4 items-center justify-center rounded-full bg-surface-container border border-outline-variant'
              }
            >
              {isCurrent && (
                <span className="absolute inset-0 -m-0.5 animate-ping rounded-full bg-primary/40" />
              )}
              {reached && !isCurrent && (
                <span className="material-symbols-outlined text-on-primary" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>
                  check
                </span>
              )}
            </span>
            <span className={reached ? 'text-body-md text-on-surface' : 'text-body-md text-on-surface-variant'}>
              {labelFor(s)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function labelFor(s: IngestStatus): string {
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
  if (s === 'ready') return 'bg-secondary-container/40 text-on-secondary-container';
  if (s === 'error') return 'bg-error-container/40 text-on-error-container';
  return 'bg-primary-container/30 text-on-primary-container';
}

function iconFor(sourceType: string): string {
  if (/audio|mp3|m4a|wav|ogg|flac/i.test(sourceType)) return 'headphones';
  if (/pdf/i.test(sourceType)) return 'picture_as_pdf';
  if (/ppt|pptx/i.test(sourceType)) return 'present_to_all';
  if (/md|markdown|txt/i.test(sourceType)) return 'description';
  if (/doc|docx/i.test(sourceType)) return 'description';
  return 'draft';
}

function iconBg(sourceType: string): string {
  if (/audio|mp3|m4a|wav|ogg|flac/i.test(sourceType)) {
    return 'bg-secondary-container text-on-secondary-container';
  }
  if (/ppt|pptx/i.test(sourceType)) {
    return 'bg-tertiary-container text-on-tertiary-container';
  }
  return 'bg-primary-container text-on-primary-container';
}
