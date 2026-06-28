import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { challenge, useSocial, type ProfileLite } from '@/lib/social';
import { friendlyError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type Mode = '1v1' | 'timed' | 'random' | 'document' | 'chapter';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: '1v1', label: '1v1', hint: 'Standard 5-question battle.' },
  { id: 'timed', label: 'Timed', hint: 'Each question has a 10s clock.' },
  { id: 'random', label: 'Random topic', hint: 'Questions span all your documents.' },
  { id: 'document', label: 'Document specific', hint: 'Drill on one document.' },
  { id: 'chapter', label: 'Chapter specific', hint: 'Focus on one chapter.' },
];

interface Opponent {
  username: string;
  display_name?: string | null;
  avatar_seed?: string | null;
  user_id?: string | null;
}

interface Props {
  opponent: Opponent;
  open: boolean;
  onClose: () => void;
}

export function ChallengeDialog({ opponent, open, onClose }: Props) {
  const navigate = useNavigate();
  const social = useSocial();
  const [mode, setMode] = useState<Mode>('1v1');
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docId, setDocId] = useState<string>('');
  const [chapter, setChapter] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsDoc = mode === 'document' || mode === 'chapter';
  const needsChapter = mode === 'chapter';
  // For non-doc modes the picker is shown but the selection is optional —
  // it just biases which question pool the server pulls from.
  const showDocPicker = true;

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
    setMode('1v1');
    setChapter('');
    setDocsLoading(true);
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id;
        if (!uid) {
          setDocs([]);
          return;
        }
        const r = await fetchDocuments(uid);
        const withQuiz = r.items.filter((d) => d.counts.quiz > 0);
        setDocs(withQuiz);
        if (withQuiz.length && !docId) setDocId(withQuiz[0].id);
      } catch (e) {
        setErr(friendlyError(e));
      } finally {
        setDocsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedDoc = useMemo(() => docs.find((d) => d.id === docId) ?? null, [docs, docId]);
  // Chapter strings aren't on DocSummary yet, so derive a simple list — bucket
  // quiz items into ~5-question chapters as a placeholder until the backend
  // exposes real chapter metadata.
  const chapterOptions = useMemo(() => {
    if (!selectedDoc) return [] as string[];
    const n = Math.max(1, Math.ceil((selectedDoc.counts.quiz || 0) / 5));
    return Array.from({ length: n }, (_, i) => `Chapter ${i + 1}`);
  }, [selectedDoc]);

  useEffect(() => {
    if (needsChapter && chapter === '' && chapterOptions.length) {
      setChapter(chapterOptions[0]);
    }
  }, [needsChapter, chapter, chapterOptions]);

  const isSelfTarget =
    !!social.user_id &&
    !!opponent.user_id &&
    social.user_id === opponent.user_id;

  const isSelfUsername =
    !!social.profile?.username &&
    opponent.username.toLowerCase() === social.profile.username.toLowerCase();

  const selfDetected = isSelfTarget || isSelfUsername;

  async function handleSubmit() {
    if (selfDetected) {
      setErr(
        `You're signed in as @${social.profile?.username ?? '(unknown)'} — that's the same account as @${opponent.username}. Open an incognito window and sign in as a different user to challenge them.`,
      );
      return;
    }
    if (needsDoc && !docId) {
      setErr('Pick a document to use for this challenge.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const c = await challenge({
        to: opponent.username,
        mode,
        // Pass docId for any mode if the user picked one — biases the question
        // pool but isn't required for 1v1/timed/random.
        doc_id: docId || null,
        chapter: needsChapter ? chapter || null : null,
      });
      onClose();
      // Hop straight into the quiz battle with the chosen settings.
      const params = new URLSearchParams({
        user: opponent.username,
        mode,
      });
      if (docId) params.set('doc', docId);
      if (needsChapter && chapter) params.set('chapter', chapter);
      if (c?.id) params.set('cid', c.id);
      navigate(`/challenge?${params.toString()}`);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Challenge @${opponent.username}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-soft-lg backdrop-blur"
      >
        <header className="flex items-center gap-3 border-b border-outline-variant p-4">
          <Avatar
            seed={opponent.avatar_seed || opponent.username}
            username={opponent.username}
            size={44}
            linkTo={false}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Quiz Battle</p>
            <h2 className="truncate text-base font-bold text-on-surface">
              {opponent.display_name || opponent.username}
            </h2>
            <p className="truncate text-[11px] text-on-surface-variant">@{opponent.username}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-surface-container px-2.5 py-1 text-xs text-on-surface-variant hover:bg-surface-container-high"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 p-4">
          {selfDetected && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
              <p className="font-semibold text-on-surface">Same account detected</p>
              <p className="mt-1 text-rose-100/80">
                You're signed in as <strong>@{social.profile?.username ?? '(unknown)'}</strong> and
                trying to challenge <strong>@{opponent.username}</strong>. Sign in as a different
                account in an incognito window to test 1v1.
              </p>
            </div>
          )}

          {/* Mode selector */}
          <section>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Mode</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-2xl border px-3 py-2 text-left text-[11px] transition-colors ${
                    mode === m.id
                      ? 'border-primary/50 bg-primary/15 text-on-surface shadow-glow'
                      : 'border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <span className="block font-semibold">{m.label}</span>
                  <span className="mt-0.5 block text-[10px] text-on-surface-variant">{m.hint}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Document picker */}
          {showDocPicker && (
            <section>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                Document {needsDoc ? '' : '(optional)'}
              </p>
              {docsLoading ? (
                <p className="mt-2 text-xs text-on-surface-variant">Loading your documents…</p>
              ) : docs.length === 0 ? (
                <p className="mt-2 rounded-2xl border border-dashed border-outline-variant p-3 text-xs text-on-surface-variant">
                  No documents with quizzes yet.{' '}
                  {needsDoc
                    ? 'Upload one first, or pick a different mode.'
                    : 'The server will look for any quizzes from either player.'}
                </p>
              ) : (
                <select
                  value={docId}
                  onChange={(e) => setDocId(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                >
                  {!needsDoc && <option value="">Any document (mixed)</option>}
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.counts.quiz} quizzes)
                    </option>
                  ))}
                </select>
              )}
            </section>
          )}

          {/* Chapter picker */}
          {needsChapter && chapterOptions.length > 0 && (
            <section>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Chapter</p>
              <select
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              >
                {chapterOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </section>
          )}

          {err && (
            <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
              {err}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-outline-variant bg-surface-container p-3">
          <button
            onClick={onClose}
            className="rounded-full border border-outline bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || selfDetected || (needsDoc && !docId)}
            className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2 text-xs font-semibold text-on-primary shadow-glow disabled:opacity-50"
          >
            {busy ? 'Sending…' : '⚔ Send challenge'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Convenience type for callers that already have ProfileLite-like data. */
export type ChallengeDialogOpponent = Opponent;

export function opponentFromProfileLite(p: ProfileLite): Opponent {
  return { username: p.username, display_name: p.display_name, avatar_seed: p.avatar_seed, user_id: p.user_id };
}
