// Multiplayer quiz battle room on the new clinical light theme.
//
// Server is the source of truth: questions are frozen on the challenge row
// when the recipient accepts, and every answer is POSTed for validation so
// both players see identical scores. The page is driven by a single polled
// resource: GET /api/challenges/{cid}.
//
// States rendered:
//  - pending (recipient) → Accept / Decline
//  - pending (creator)   → Waiting for opponent
//  - declined / cancelled → final notice
//  - in_progress         → 3·2·1 countdown then quiz with live scoreboard
//  - completed           → match-over screen with final score
//
// The mockup `home/challenges.html` is a lobby (league banner, joinable
// quiz battles, leaderboard, daily challenges) — none of those backends
// exist yet, so the lobby is deferred. URL params: ?cid=<challenge_id>.
// Legacy ?user=&mode=&doc= params are honored — if `cid` is missing but
// `user` is present, we route via the challenge dialog instead of
// immediately creating a challenge.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { ChallengeDialog } from '@/components/social/ChallengeDialog';
import { ErrorState } from '@/components/social/SocialStates';
import { api, friendlyError } from '@/lib/api';
import {
  fetchProfileByUsername,
  type Challenge,
  type ProfileLite,
  useSocial,
} from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { QuizItem } from '../../../../packages/shared-types/artifacts';

type ChallengeStatus =
  | 'pending' | 'accepted' | 'declined' | 'in_progress'
  | 'completed' | 'cancelled' | 'expired' | 'finished';

interface ProgressShape {
  answers: { q: number; pick: number; correct: boolean; time_ms: number }[];
  correct: number;
  wrong: number;
  completed: number;
  time_taken_ms: number;
  score: number;
  done: boolean;
}

interface ChallengeRow {
  id: string;
  from_user: string;
  to_user: string;
  status: ChallengeStatus;
  mode: string;
  subject: string | null;
  document_id: string | null;
  chapter: string | null;
  quiz_items: { id: string; payload: QuizItem }[] | null;
  progress_from: ProgressShape;
  progress_to: ProgressShape;
  question_count: number;
  time_limit_s: number;
  wins_from: number | null;
  wins_to: number | null;
  started_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  finished_at: string | null;
  from: ProfileLite;
  to: ProfileLite;
}

const POLL_MS = 2000;
const COUNTDOWN_S = 3;
const FAIL_THRESHOLD_BEFORE_BLOCK = 4;

export default function ChallengePage() {
  const [params] = useSearchParams();
  const cid = params.get('cid');
  const legacyUser = params.get('user');
  const navigate = useNavigate();
  const social = useSocial();
  const [userId, setUserId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [legacyOpponent, setLegacyOpponent] = useState<ProfileLite | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (cid || !legacyUser) return;
    void (async () => {
      const p = await fetchProfileByUsername(legacyUser);
      if (p) {
        setLegacyOpponent({
          user_id: p.user_id,
          username: p.username,
          display_name: p.display_name,
          avatar_seed: p.avatar_seed,
        });
        setDialogOpen(true);
      }
    })();
  }, [cid, legacyUser]);

  if (!cid && !legacyUser) {
    return <ChallengeLobby />;
  }
  if (!cid && legacyUser) {
    return (
      <div className="mx-auto max-w-md px-md py-xl text-center text-body-sm text-on-surface-variant">
        Configure your challenge to @{legacyUser}…
        {legacyOpponent && (
          <ChallengeDialog
            open={dialogOpen}
            onClose={() => { setDialogOpen(false); navigate(-1); }}
            opponent={legacyOpponent}
          />
        )}
      </div>
    );
  }
  if (!userId) return <Empty msg="Sign in to view this challenge." />;

  return <ChallengeRoom cid={cid!} userId={userId} mySelfUsername={social.profile?.username} />;
}

function ChallengeRoom({ cid, userId, mySelfUsername }: { cid: string; userId: string; mySelfUsername?: string }) {
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(Date.now());
  const [consecutiveFails, setConsecutiveFails] = useState(0);
  const navigate = useNavigate();

  const isCreator = challenge ? challenge.from_user === userId : false;
  const isRecipient = challenge ? challenge.to_user === userId : false;
  const me = challenge ? (isCreator ? challenge.from : challenge.to) : null;
  const opp = challenge ? (isCreator ? challenge.to : challenge.from) : null;
  const myProgress = challenge ? (isCreator ? challenge.progress_from : challenge.progress_to) : null;
  const oppProgress = challenge ? (isCreator ? challenge.progress_to : challenge.progress_from) : null;
  const myScore = myProgress?.score ?? 0;
  const oppScore = oppProgress?.score ?? 0;

  const inFlightRef = useRef(false);
  const mutatingRef = useRef(false);

  /** Never let an older snapshot overwrite a newer one. */
  const applyChallenge = useCallback(
    (incoming: ChallengeRow, source: 'poll' | 'mutation') => {
      setChallenge((prev) => {
        if (!prev) return incoming;
        if (source === 'mutation') return incoming;
        const progressOf = (c: ChallengeRow) =>
          (c.progress_from?.completed ?? 0) + (c.progress_to?.completed ?? 0);
        const rankStatus = (s: ChallengeStatus): number =>
          s === 'pending' ? 0 :
          s === 'in_progress' ? 1 :
          s === 'completed' || s === 'finished' ? 2 :
          s === 'declined' || s === 'cancelled' || s === 'expired' ? 3 : 0;
        const incomingNewer =
          rankStatus(incoming.status) > rankStatus(prev.status) ||
          (rankStatus(incoming.status) === rankStatus(prev.status) &&
            progressOf(incoming) >= progressOf(prev));
        return incomingNewer ? incoming : prev;
      });
    },
    [],
  );

  const loadOnce = useCallback(async () => {
    if (inFlightRef.current || mutatingRef.current) return;
    inFlightRef.current = true;
    try {
      const r = await api<ChallengeRow>(
        `/api/challenges/${encodeURIComponent(cid)}?user_id=${encodeURIComponent(userId)}`,
      );
      applyChallenge(r, 'poll');
      setLoadErr(null);
      setConsecutiveFails(0);
      setActionErr((prev) =>
        prev && /can't reach neurofeed|networkerror|load failed/i.test(prev) ? null : prev,
      );
    } catch (e) {
      setLoadErr(friendlyError(e));
      setConsecutiveFails((n) => n + 1);
    } finally {
      inFlightRef.current = false;
    }
  }, [cid, userId, applyChallenge]);

  const status = challenge?.status;
  const terminalStatus =
    status === 'completed' || status === 'finished' ||
    status === 'declined' || status === 'cancelled' || status === 'expired';
  useEffect(() => {
    void loadOnce();
    if (terminalStatus) return;
    let timer: number | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => void loadOnce(), POLL_MS);
    };
    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { void loadOnce(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [loadOnce, terminalStatus]);

  const lastSeenStatusRef = useRef<ChallengeStatus | null>(null);
  useEffect(() => {
    if (!challenge) return;
    const prev = lastSeenStatusRef.current;
    if (challenge.status === 'in_progress' && prev !== 'in_progress') {
      const meAnswered = (myProgress?.completed ?? 0) > 0;
      if (!meAnswered) setCountdown(COUNTDOWN_S);
    }
    lastSeenStatusRef.current = challenge.status;
  }, [challenge, myProgress]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setQuestionStartedAt(Date.now());
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  const myCompleted = myProgress?.completed ?? 0;
  useEffect(() => {
    setPicked(null);
    setQuestionStartedAt(Date.now());
  }, [myCompleted]);

  async function accept() {
    if (!challenge) return;
    setBusy(true); setActionErr(null);
    mutatingRef.current = true;
    try {
      const r = await api<{ challenge: ChallengeRow }>(
        `/api/challenges/${encodeURIComponent(cid)}/accept?user_id=${encodeURIComponent(userId)}`,
        { method: 'POST' },
      );
      if (r?.challenge) applyChallenge(r.challenge, 'mutation');
    } catch (e) {
      setActionErr(friendlyError(e));
    } finally {
      mutatingRef.current = false;
      setBusy(false);
    }
  }

  async function decline() {
    if (!challenge) return;
    if (!window.confirm('Decline this challenge?')) return;
    setBusy(true); setActionErr(null);
    mutatingRef.current = true;
    try {
      await api(`/api/challenges/${encodeURIComponent(cid)}/decline?user_id=${encodeURIComponent(userId)}`, { method: 'POST' });
      await loadOnce();
    } catch (e) {
      setActionErr(friendlyError(e));
    } finally {
      mutatingRef.current = false;
      setBusy(false);
    }
  }

  async function submitAnswer(optionIndex: number) {
    if (!challenge || picked !== null || !challenge.quiz_items) return;
    if (!myProgress || myProgress.done) return;
    const qIdx = myProgress.completed;
    setPicked(optionIndex);
    const timeMs = Date.now() - questionStartedAt;
    mutatingRef.current = true;
    try {
      const r = await api<{ challenge: ChallengeRow }>(
        `/api/challenges/${encodeURIComponent(cid)}/answer?user_id=${encodeURIComponent(userId)}`,
        { method: 'POST', body: JSON.stringify({ question_index: qIdx, option_index: optionIndex, time_ms: timeMs }) },
      );
      if (r?.challenge) applyChallenge(r.challenge, 'mutation');
    } catch (e) {
      setActionErr(friendlyError(e));
      setPicked(null);
    } finally {
      mutatingRef.current = false;
    }
  }

  if (!challenge) {
    if (loadErr && consecutiveFails >= FAIL_THRESHOLD_BEFORE_BLOCK) {
      return (
        <div className="mx-auto max-w-md px-md py-xl">
          <ErrorState title="Couldn't load this challenge" message={loadErr} onRetry={loadOnce} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-sm px-md py-xl text-center text-body-sm text-on-surface-variant">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-surface-container border-t-primary" />
        <p>Connecting to the match…</p>
        {loadErr && (
          <p className="mt-2 text-label-sm text-on-error-container">
            Retrying… ({consecutiveFails} attempt{consecutiveFails === 1 ? '' : 's'})
          </p>
        )}
      </div>
    );
  }

  const sameSelf = !!(me && opp && me.user_id && opp.user_id && me.user_id === opp.user_id);

  return (
    <div className="mx-auto max-w-2xl px-md py-md">
      <Scoreboard
        me={me} opp={opp}
        myScore={myScore} oppScore={oppScore}
        myCompleted={myProgress?.completed ?? 0}
        oppCompleted={oppProgress?.completed ?? 0}
        total={challenge.question_count}
        subject={challenge.subject}
        status={challenge.status}
      />

      {sameSelf && (
        <div className="mt-3 rounded-xl border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container">
          Both sides resolve to the same account ({mySelfUsername ? `@${mySelfUsername}` : 'unknown'}).
          Open an incognito window and sign in as a different user to play 1v1.
        </div>
      )}

      {actionErr && (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container">
          <span className="flex-1">{actionErr}</span>
          <button
            onClick={() => setActionErr(null)}
            className="rounded-full bg-surface-container px-2 py-0.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            Dismiss
          </button>
        </div>
      )}

      {loadErr && challenge && consecutiveFails > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-xl border border-tertiary-container bg-tertiary-container/30 p-2 text-label-sm text-on-tertiary-container">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
          Reconnecting… (last poll failed). Hold tight, your moves are still being submitted to the server.
        </p>
      )}

      <main className="mt-md">
        {challenge.status === 'pending' && isRecipient && (
          <PendingForRecipient
            opp={opp}
            subject={challenge.subject}
            mode={challenge.mode}
            busy={busy}
            onAccept={accept}
            onDecline={decline}
          />
        )}
        {challenge.status === 'pending' && isCreator && (
          <PendingForCreator opp={opp} busy={busy} onCancel={decline} />
        )}
        {(challenge.status === 'declined' || challenge.status === 'cancelled') && (
          <FinalNotice
            title={challenge.status === 'declined' ? 'Challenge declined' : 'Challenge cancelled'}
            body={
              challenge.status === 'declined'
                ? `${opp?.username ? `@${opp.username}` : 'They'} declined this match.`
                : 'This challenge was cancelled.'
            }
          />
        )}
        {challenge.status === 'expired' && (
          <FinalNotice title="Challenge expired" body="The opponent didn't respond in time." />
        )}
        {challenge.status === 'in_progress' && (
          countdown !== null ? (
            <Countdown n={countdown} />
          ) : myProgress?.done && !oppProgress?.done ? (
            <Waiting msg={`Waiting for ${opp?.username ? `@${opp.username}` : 'opponent'} to finish…`} />
          ) : (
            <QuizPanel
              items={challenge.quiz_items ?? []}
              progressMine={myProgress}
              progressOpp={oppProgress}
              picked={picked}
              onPick={submitAnswer}
              timeLimitS={challenge.time_limit_s}
              questionStartedAt={questionStartedAt}
              mode={challenge.mode}
              onTimeout={() => { void submitAnswer(-1).catch(() => undefined); }}
            />
          )
        )}
        {(challenge.status === 'completed' || challenge.status === 'finished') && (
          <CompletedPanel
            challenge={challenge}
            isCreator={isCreator}
            me={me}
            opp={opp}
            onRematch={() => {
              if (opp?.username) navigate(`/challenge?user=${encodeURIComponent(opp.username)}`);
            }}
          />
        )}
      </main>
    </div>
  );
}

// -------------------- Sub-views --------------------

function Scoreboard({
  me, opp, myScore, oppScore, myCompleted, oppCompleted, total, subject, status,
}: {
  me: ProfileLite | null;
  opp: ProfileLite | null;
  myScore: number;
  oppScore: number;
  myCompleted: number;
  oppCompleted: number;
  total: number;
  subject: string | null;
  status: ChallengeStatus;
}) {
  return (
    <header className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-secondary p-md text-on-primary shadow-lg">
      <div className="absolute right-0 top-0 p-lg opacity-10" aria-hidden>
        <span className="material-symbols-outlined" style={{ fontSize: '120px' }}>military_tech</span>
      </div>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-label-sm uppercase tracking-widest text-white/70">Quiz Battle</p>
          <span className={`rounded-full px-2 py-0.5 text-label-sm uppercase tracking-widest ${statusToTone(status)}`}>
            {status.replace('_', ' ')}
          </span>
          {subject && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-label-sm">{subject}</span>
          )}
        </div>
        <div className="mt-md grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PlayerSide profile={me} score={myScore} completed={myCompleted} total={total} side="left" />
          <span className="text-headline-md font-bold text-white/70">vs</span>
          <PlayerSide profile={opp} score={oppScore} completed={oppCompleted} total={total} side="right" />
        </div>
      </div>
    </header>
  );
}

function PlayerSide({
  profile, score, completed, total, side,
}: { profile: ProfileLite | null; score: number; completed: number; total: number; side: 'left' | 'right' }) {
  if (!profile) return <div className="h-12" />;
  return (
    <div
      className={
        side === 'left'
          ? 'flex items-center gap-3 rounded-xl border border-white/30 bg-white/10 p-3 backdrop-blur-md'
          : 'flex items-center gap-3 rounded-xl border border-white/15 bg-black/10 p-3 backdrop-blur-md'
      }
    >
      <Avatar seed={profile.avatar_seed || profile.user_id} username={profile.username} size={40} linkTo={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md font-bold text-white">@{profile.username}</p>
        <p className="text-label-sm text-white/65">{completed}/{total} answered</p>
      </div>
      <span className="rounded-full bg-white/20 px-2.5 py-1 text-body-md font-bold tabular-nums text-white">
        {score}
      </span>
    </div>
  );
}

function statusToTone(s: ChallengeStatus): string {
  switch (s) {
    case 'pending':     return 'bg-amber-500/30 text-white';
    case 'in_progress': return 'bg-white/25 text-white';
    case 'completed':
    case 'finished':    return 'bg-emerald-500/30 text-white';
    case 'declined':
    case 'cancelled':
    case 'expired':     return 'bg-red-500/30 text-white';
    default:            return 'bg-white/15 text-white';
  }
}

function PendingForRecipient({
  opp, subject, mode, busy, onAccept, onDecline,
}: { opp: ProfileLite | null; subject: string | null; mode: string; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-card">
      <h2 className="text-headline-md text-on-surface">
        {opp?.username ? `@${opp.username}` : 'Someone'} challenged you!
      </h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {subject ? `Subject: ${subject}` : 'Mixed subjects'} · Mode: {mode}
      </p>
      <div className="mt-md flex flex-wrap justify-center gap-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-md hover:bg-on-primary-container disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>play_arrow</span>
          {busy ? '…' : 'Accept & start'}
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container px-6 py-2.5 text-label-md font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
          Decline
        </button>
      </div>
    </div>
  );
}

function PendingForCreator({ opp, busy, onCancel }: { opp: ProfileLite | null; busy: boolean; onCancel: () => void }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-card">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container animate-pulse">
        <span className="material-symbols-outlined text-on-primary-container" style={{ fontSize: '28px' }}>
          hourglass_top
        </span>
      </div>
      <h2 className="text-headline-md text-on-surface">
        Waiting for {opp?.username ? `@${opp.username}` : 'opponent'}…
      </h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        They'll get a notification and the match starts when they accept.
      </p>
      <button
        onClick={onCancel}
        disabled={busy}
        className="mt-md rounded-lg border border-outline-variant bg-surface-container px-5 py-2 text-label-md font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
      >
        Cancel challenge
      </button>
    </div>
  );
}

function Countdown({ n }: { n: number }) {
  return (
    <div className="mt-xl flex flex-col items-center">
      <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">Match starting in</p>
      <span className="mt-1 bg-gradient-to-br from-primary to-secondary bg-clip-text text-[5rem] font-black tabular-nums text-transparent">
        {n > 0 ? n : 'Go!'}
      </span>
    </div>
  );
}

function Waiting({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-xl text-center shadow-card">
      <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-surface-container border-t-primary" />
      <p className="text-body-md text-on-surface">{msg}</p>
    </div>
  );
}

function QuizPanel({
  items, progressMine, picked, onPick, timeLimitS, mode, onTimeout,
}: {
  items: { id: string; payload: QuizItem }[];
  progressMine: ProgressShape | null;
  progressOpp: ProgressShape | null;
  picked: number | null;
  onPick: (optionIndex: number) => void;
  timeLimitS: number;
  questionStartedAt: number;
  mode: string;
  onTimeout: (qIdx: number) => void;
}) {
  const idx = progressMine?.completed ?? 0;
  const current = items[idx];
  const total = items.length;
  const timed = mode === 'timed';
  const [secondsLeft, setSecondsLeft] = useState<number>(timed ? timeLimitS : 0);

  useEffect(() => {
    if (!timed) return;
    setSecondsLeft(timeLimitS);
  }, [idx, timed, timeLimitS]);

  useEffect(() => {
    if (!timed || picked !== null) return;
    if (secondsLeft <= 0) { onTimeout(idx); return; }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timed, secondsLeft, picked, idx, onTimeout]);

  if (!current) return <Waiting msg="Loading question…" />;

  const correctIdx = current.payload.answer_index;
  return (
    <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">
          Question {idx + 1} / {total}
        </p>
        {timed && picked === null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container/40 px-3 py-1 text-label-sm font-bold tabular-nums text-on-tertiary-container">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>timer</span>
            {secondsLeft}s
          </span>
        )}
      </div>
      <h2 className="mt-2 text-body-lg font-bold text-on-surface">{current.payload.stem}</h2>
      <div className="mt-md grid gap-2">
        {current.payload.options.map((opt, i) => {
          const isAnswer = i === correctIdx;
          const isPicked = i === picked;
          let tone =
            'border-outline-variant bg-surface-container-low hover:bg-surface-container';
          if (picked !== null && isAnswer) {
            tone = 'border-primary bg-primary-container/40 text-on-primary-container';
          } else if (picked !== null && isPicked) {
            tone = 'border-error bg-error-container/40 text-on-error-container';
          } else if (picked !== null) {
            tone = 'border-outline-variant bg-surface-container-low opacity-60';
          }
          return (
            <button
              key={i}
              onClick={() => onPick(i)}
              disabled={picked !== null}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-body-md transition-colors disabled:cursor-default ${tone}`}
            >
              <span className="text-label-md font-bold text-on-surface-variant tabular-nums">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="mt-md flex items-start gap-2 text-body-sm text-on-surface-variant">
          <span
            className={`material-symbols-outlined ${picked === correctIdx ? 'text-primary' : 'text-error'}`}
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            {picked === correctIdx ? 'check_circle' : 'cancel'}
          </span>
          <span>{current.payload.explanation}</span>
        </p>
      )}
    </article>
  );
}

function CompletedPanel({
  challenge, isCreator, opp, onRematch,
}: {
  challenge: ChallengeRow;
  isCreator: boolean;
  me: ProfileLite | null;
  opp: ProfileLite | null;
  onRematch: () => void;
}) {
  const myScore = isCreator ? challenge.progress_from.score : challenge.progress_to.score;
  const oppScore = isCreator ? challenge.progress_to.score : challenge.progress_from.score;
  const verdict = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'draw';
  return (
    <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-card">
      <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">Match over</p>
      <div
        className={
          verdict === 'win'
            ? 'mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container'
            : verdict === 'loss'
              ? 'mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-error-container/60'
              : 'mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-tertiary-container/60'
        }
      >
        <span
          className={
            verdict === 'win'
              ? 'material-symbols-outlined text-on-secondary-container'
              : verdict === 'loss'
                ? 'material-symbols-outlined text-on-error-container'
                : 'material-symbols-outlined text-on-tertiary-container'
          }
          style={{ fontSize: '32px', fontVariationSettings: "'FILL' 1" }}
        >
          {verdict === 'win' ? 'emoji_events' : verdict === 'loss' ? 'sentiment_neutral' : 'balance'}
        </span>
      </div>
      <h2 className="mt-2 text-headline-md text-on-surface">
        {verdict === 'win' ? 'You won!' : verdict === 'loss' ? `${opp?.username ? `@${opp.username}` : 'Opponent'} won` : 'Draw'}
      </h2>
      <p className="mt-2 text-body-md text-on-surface-variant tabular-nums">Final: {myScore} – {oppScore}</p>
      <div className="mt-md flex flex-wrap justify-center gap-2">
        <button
          onClick={onRematch}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 text-label-md font-bold text-on-primary-container hover:brightness-95"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
          Rematch
        </button>
        {opp?.username && (
          <Link
            to={`/u/${opp.username}`}
            className="rounded-lg border border-outline-variant bg-surface-container px-4 py-2 text-label-md font-bold text-on-surface hover:bg-surface-container-high"
          >
            View @{opp.username}
          </Link>
        )}
        <Link
          to="/friends"
          className="rounded-lg border border-outline-variant bg-surface-container px-4 py-2 text-label-md font-bold text-on-surface hover:bg-surface-container-high"
        >
          See all challenges
        </Link>
      </div>
    </article>
  );
}

function FinalNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-xl text-center shadow-card">
      <h2 className="text-headline-md text-on-surface">{title}</h2>
      <p className="mt-1.5 text-body-md text-on-surface-variant">{body}</p>
      <Link
        to="/discover"
        className="mt-md inline-flex items-center gap-1 rounded-lg bg-primary-container px-5 py-2 text-label-md font-bold text-on-primary-container hover:brightness-95"
      >
        Find someone else to challenge
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
      </Link>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="mx-auto max-w-md px-md py-xl text-center text-body-sm text-on-surface-variant">{msg}</div>;
}

// ===========================================================================
// Lobby — shown when the sidebar Challenges link is opened with no `cid`.
// Reads from the social store's `challenges` array (hydrated by bootstrap),
// groups by status, and links each row to the room.
// ===========================================================================

function ChallengeLobby() {
  const social = useSocial();
  const meId = social.user_id;
  const challenges = social.challenges;

  if (!social.ready) {
    return (
      <div className="mx-auto max-w-2xl px-md py-xl text-center text-body-sm text-on-surface-variant">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-surface-container border-t-primary" />
        Loading your challenges…
      </div>
    );
  }

  const ongoing = challenges.filter((c) => c.status === 'accepted' || (c.status as string) === 'in_progress');
  const incoming = challenges.filter((c) => c.status === 'pending' && c.to_user === meId);
  const outgoing = challenges.filter((c) => c.status === 'pending' && c.from_user === meId);
  const finished = challenges.filter((c) => c.status === 'finished' || c.status === 'declined');

  const hasAny = ongoing.length + incoming.length + outgoing.length + finished.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-md py-md">
      <header className="mb-md">
        <h1 className="text-headline-md text-on-surface">Challenges</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Quiz battles with other learners. Open a profile and tap{' '}
          <span className="rounded bg-tertiary-container/40 px-1 text-on-tertiary-container">Challenge</span>{' '}
          to start a new one.
        </p>
      </header>

      {!hasAny && (
        <Empty msg="No challenges yet — head to a profile to send your first." />
      )}

      <ChallengeGroup
        title="Ongoing"
        items={ongoing}
        meId={meId}
        emptyMsg={null}
      />
      <ChallengeGroup
        title="Incoming"
        items={incoming}
        meId={meId}
        emptyMsg={null}
        accent="incoming"
      />
      <ChallengeGroup
        title="Awaiting opponent"
        items={outgoing}
        meId={meId}
        emptyMsg={null}
      />
      <ChallengeGroup
        title="Past battles"
        items={finished}
        meId={meId}
        emptyMsg={null}
      />
    </div>
  );
}

function ChallengeGroup({
  title, items, meId, emptyMsg, accent,
}: {
  title: string;
  items: Challenge[];
  meId: string | null;
  emptyMsg: string | null;
  accent?: 'incoming';
}) {
  if (items.length === 0 && !emptyMsg) return null;
  return (
    <section className="mb-lg">
      <h2 className="mb-2 text-label-md uppercase tracking-widest text-on-surface-variant">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-md text-body-sm text-on-surface-variant">
          {emptyMsg}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <ChallengeListRow key={c.id} challenge={c} meId={meId} accent={accent} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ChallengeListRow({
  challenge, meId, accent,
}: { challenge: Challenge; meId: string | null; accent?: 'incoming' }) {
  const meIsFrom = challenge.from_user === meId;
  const opp = meIsFrom ? challenge.to : challenge.from;
  const myScore = meIsFrom ? challenge.wins_from : challenge.wins_to;
  const oppScore = meIsFrom ? challenge.wins_to : challenge.wins_from;

  let verdict: 'win' | 'loss' | 'draw' | null = null;
  if (challenge.status === 'finished' && myScore != null && oppScore != null) {
    verdict = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'draw';
  }

  return (
    <li>
      <Link
        to={`/challenge?cid=${encodeURIComponent(challenge.id)}`}
        className={
          accent === 'incoming'
            ? 'flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-container/30 p-md transition-colors hover:bg-primary-container/50'
            : 'flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-md transition-colors hover:bg-surface-container-low'
        }
      >
        {opp ? (
          <Avatar
            seed={opp.avatar_seed || opp.user_id || opp.username}
            username={opp.username}
            size={40}
            linkTo={false}
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-surface-container" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-label-md font-bold text-on-surface">
            {meIsFrom ? 'You vs ' : ''}
            @{opp?.username ?? 'unknown'}
            {!meIsFrom ? ' vs you' : ''}
          </p>
          <p className="text-label-sm text-on-surface-variant">
            {labelForStatus(challenge.status)} · {challenge.mode}
            {challenge.created_at && ` · ${formatRelative(challenge.created_at)}`}
          </p>
        </div>
        {verdict && (
          <span
            className={
              verdict === 'win'
                ? 'rounded-full bg-secondary-container px-3 py-1 text-label-sm font-bold text-on-secondary-container tabular-nums'
                : verdict === 'loss'
                  ? 'rounded-full bg-error-container/60 px-3 py-1 text-label-sm font-bold text-on-error-container tabular-nums'
                  : 'rounded-full bg-tertiary-container/60 px-3 py-1 text-label-sm font-bold text-on-tertiary-container tabular-nums'
            }
          >
            {myScore}–{oppScore}
          </span>
        )}
        {!verdict && challenge.status === 'pending' && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-label-sm font-bold text-on-surface-variant">
            Pending
          </span>
        )}
      </Link>
    </li>
  );
}

function labelForStatus(s: Challenge['status'] | string): string {
  switch (s) {
    case 'pending': return 'Waiting';
    case 'accepted': return 'Accepted';
    case 'in_progress': return 'In progress';
    case 'finished': return 'Finished';
    case 'declined': return 'Declined';
    default: return s;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
