// Multiplayer quiz battle room.
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
// URL params: ?cid=<challenge_id>. Legacy ?user=&mode=&doc= params are still
// honored — if `cid` is missing but `user` is present, we navigate via the
// challenge dialog instead of immediately creating a challenge.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { ChallengeDialog } from '@/components/social/ChallengeDialog';
import { ErrorState } from '@/components/social/SocialStates';
import { api, friendlyError } from '@/lib/api';
import { fetchProfileByUsername, type ProfileLite, useSocial } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { QuizItem } from '../../../../packages/shared-types/artifacts';

type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'finished';

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
const FAIL_THRESHOLD_BEFORE_BLOCK = 4; // ~8s of failures before we block the screen

export default function ChallengePage() {
  const [params] = useSearchParams();
  const cid = params.get('cid');
  const legacyUser = params.get('user');
  const navigate = useNavigate();
  const social = useSocial();
  const [userId, setUserId] = useState<string | null>(null);

  // Self / opponent legacy redirect: if no cid but we have a username, open the
  // challenge dialog so settings are picked before a row is created.
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
    return <Empty msg="No challenge specified. Open a profile and tap 'Challenge'." />;
  }
  if (!cid && legacyUser) {
    return (
      <div className="px-8 pb-32 pt-32 text-center text-sm text-white/55">
        Configure your challenge to @{legacyUser}…
        {legacyOpponent && (
          <ChallengeDialog
            open={dialogOpen}
            onClose={() => {
              setDialogOpen(false);
              navigate(-1);
            }}
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
  // Set true while a mutation (accept/decline/answer) is being POSTed so the
  // background poller pauses — otherwise a slow stale GET could overwrite the
  // fresh server-confirmed row and leave the player visually stuck on the
  // last question they just answered.
  const mutatingRef = useRef(false);

  /** Update state from any source, but never let an older snapshot overwrite
   *  a newer one. Newness is the sum of both players' completed counts plus
   *  a tiebreaker on status finality. */
  const applyChallenge = useCallback(
    (incoming: ChallengeRow, source: 'poll' | 'mutation') => {
      setChallenge((prev) => {
        if (!prev) return incoming;
        if (source === 'mutation') return incoming; // server-confirmed
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
    if (inFlightRef.current || mutatingRef.current) return; // skip — busy
    inFlightRef.current = true;
    try {
      const r = await api<ChallengeRow>(
        `/api/challenges/${encodeURIComponent(cid)}?user_id=${encodeURIComponent(userId)}`,
      );
      applyChallenge(r, 'poll');
      setLoadErr(null);
      setConsecutiveFails(0);
      // A successful poll proves the server is reachable, so any "Can't reach
      // NeuroFeed" banner from an earlier mutation (e.g. an accept POST that
      // timed out on the client but actually succeeded server-side) is stale.
      setActionErr((prev) =>
        prev && /can't reach neurofeed|networkerror|load failed/i.test(prev) ? null : prev,
      );
    } catch (e) {
      // Don't block on a single transient blip — record it and let the next
      // poll heal. The render path only treats it as fatal after several
      // consecutive failures.
      setLoadErr(friendlyError(e));
      setConsecutiveFails((n) => n + 1);
    } finally {
      inFlightRef.current = false;
    }
  }, [cid, userId, applyChallenge]);

  // Poll. Stop polling once the match has reached a final state — there's
  // nothing more to fetch and we don't want background tabs hammering the API.
  // Also pause while the tab is hidden; refresh once on return so the player
  // catches up to whatever happened on the opponent's side.
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
      if (document.hidden) {
        stop();
      } else {
        void loadOnce();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [loadOnce, terminalStatus]);

  // Trigger countdown when status flips to in_progress and we haven't shown it yet
  const lastSeenStatusRef = useRef<ChallengeStatus | null>(null);
  useEffect(() => {
    if (!challenge) return;
    const prev = lastSeenStatusRef.current;
    if (challenge.status === 'in_progress' && prev !== 'in_progress') {
      // Only run countdown if we haven't already answered anything
      const meAnswered = (myProgress?.completed ?? 0) > 0;
      if (!meAnswered) {
        setCountdown(COUNTDOWN_S);
      }
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

  // Reset picked state when the current question changes
  const myCompleted = myProgress?.completed ?? 0;
  useEffect(() => {
    setPicked(null);
    setQuestionStartedAt(Date.now());
  }, [myCompleted]);

  async function accept() {
    if (!challenge) return;
    setBusy(true);
    setActionErr(null);
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
    setBusy(true);
    setActionErr(null);
    mutatingRef.current = true;
    try {
      await api(`/api/challenges/${encodeURIComponent(cid)}/decline?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST',
      });
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
        {
          method: 'POST',
          body: JSON.stringify({ question_index: qIdx, option_index: optionIndex, time_ms: timeMs }),
        },
      );
      if (r?.challenge) applyChallenge(r.challenge, 'mutation');
    } catch (e) {
      setActionErr(friendlyError(e));
      setPicked(null);
    } finally {
      mutatingRef.current = false;
    }
  }

  // Only treat the load as fatal if we still don't have a challenge AND we've
  // failed several polls in a row. Otherwise keep "Connecting…" up and let the
  // background poller heal the page.
  if (!challenge) {
    if (loadErr && consecutiveFails >= FAIL_THRESHOLD_BEFORE_BLOCK) {
      return (
        <div className="mx-auto max-w-md px-4 pb-32 pt-32">
          <ErrorState title="Couldn't load this challenge" message={loadErr} onRetry={loadOnce} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-sm px-4 pb-32 pt-32 text-center text-sm text-white/70">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-primary" />
        <p>Connecting to the match…</p>
        {loadErr && (
          <p className="mt-2 text-[11px] text-rose-200/80">
            Retrying… ({consecutiveFails} attempt{consecutiveFails === 1 ? '' : 's'})
          </p>
        )}
      </div>
    );
  }

  // Sanity check: warn if both players appear to be the same account
  const sameSelf =
    me && opp && me.user_id && opp.user_id && me.user_id === opp.user_id
      ? true
      : false;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-24">
      <Scoreboard
        me={me}
        opp={opp}
        myScore={myScore}
        oppScore={oppScore}
        myCompleted={myProgress?.completed ?? 0}
        oppCompleted={oppProgress?.completed ?? 0}
        total={challenge.question_count}
        subject={challenge.subject}
        status={challenge.status}
      />

      {sameSelf && (
        <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
          Both sides resolve to the same account ({mySelfUsername ? `@${mySelfUsername}` : 'unknown'}). Open an incognito window and sign in as a different user to play 1v1.
        </div>
      )}

      {actionErr && (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
          <span className="flex-1">{actionErr}</span>
          <button
            onClick={() => setActionErr(null)}
            className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {loadErr && challenge && consecutiveFails > 0 && (
        <p className="mt-2 rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-2 text-[11px] text-amber-100">
          ⚠ Reconnecting… (last poll failed). Hold tight, your moves are still being submitted to the server.
        </p>
      )}

      <main className="mt-5">
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
              onTimeout={() => {
                // submit a wrong answer (-1 marks "no pick")
                void submitAnswer(-1).catch(() => undefined);
              }}
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
    <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-primary/15 via-secondary/10 to-accent/15 p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] uppercase tracking-widest text-white/55">Quiz Battle</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${statusToTone(status)}`}>
          {status.replace('_', ' ')}
        </span>
        {subject && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/70">
            {subject}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <PlayerSide profile={me} score={myScore} completed={myCompleted} total={total} side="left" />
        <span className="text-2xl font-bold text-white/65">vs</span>
        <PlayerSide profile={opp} score={oppScore} completed={oppCompleted} total={total} side="right" />
      </div>
    </header>
  );
}

function PlayerSide({
  profile, score, completed, total, side,
}: { profile: ProfileLite | null; score: number; completed: number; total: number; side: 'left' | 'right' }) {
  if (!profile) return <div className="h-12" />;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${side === 'left' ? 'border-primary/40 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}>
      <Avatar seed={profile.avatar_seed || profile.user_id} username={profile.username} size={40} linkTo={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">@{profile.username}</p>
        <p className="text-[10px] text-white/55">{completed}/{total} answered</p>
      </div>
      <span className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-2.5 py-1 text-sm font-bold tabular-nums text-white shadow-glow">
        {score}
      </span>
    </div>
  );
}

function statusToTone(s: ChallengeStatus): string {
  switch (s) {
    case 'pending':     return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    case 'in_progress': return 'border-primary/40 bg-primary/10 text-white';
    case 'completed':
    case 'finished':    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    case 'declined':
    case 'cancelled':
    case 'expired':     return 'border-rose-400/30 bg-rose-500/10 text-rose-100';
    default:            return 'border-white/10 bg-white/[0.04] text-white/80';
  }
}

function PendingForRecipient({
  opp, subject, mode, busy, onAccept, onDecline,
}: { opp: ProfileLite | null; subject: string | null; mode: string; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-card/40 p-6 text-center">
      <h2 className="text-xl font-bold text-white">
        {opp?.username ? `@${opp.username}` : 'Someone'} challenged you!
      </h2>
      <p className="mt-1 text-sm text-white/65">
        {subject ? `Subject: ${subject}` : 'Mixed subjects'} · Mode: {mode}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-6 py-2.5 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
        >
          {busy ? '…' : '✅ Accept & start'}
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
        >
          ✗ Decline
        </button>
      </div>
    </div>
  );
}

function PendingForCreator({ opp, busy, onCancel }: { opp: ProfileLite | null; busy: boolean; onCancel: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-card/40 p-6 text-center">
      <div className="mx-auto mb-3 h-12 w-12 animate-pulse rounded-full bg-gradient-to-br from-primary via-secondary to-accent shadow-glow" />
      <h2 className="text-xl font-bold text-white">
        Waiting for {opp?.username ? `@${opp.username}` : 'opponent'}…
      </h2>
      <p className="mt-1 text-sm text-white/65">
        They'll get a notification and the match starts when they accept.
      </p>
      <button
        onClick={onCancel}
        disabled={busy}
        className="mt-5 rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
      >
        Cancel challenge
      </button>
    </div>
  );
}

function Countdown({ n }: { n: number }) {
  return (
    <div className="mt-8 flex flex-col items-center">
      <p className="text-[10px] uppercase tracking-widest text-white/55">Match starting in</p>
      <span className="mt-1 bg-gradient-to-br from-primary via-secondary to-accent bg-clip-text text-7xl font-black text-transparent tabular-nums">
        {n > 0 ? n : 'Go!'}
      </span>
    </div>
  );
}

function Waiting({ msg }: { msg: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-card/40 p-8 text-center">
      <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-primary" />
      <p className="text-sm text-white/80">{msg}</p>
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
    if (secondsLeft <= 0) {
      onTimeout(idx);
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timed, secondsLeft, picked, idx, onTimeout]);

  if (!current) return <Waiting msg="Loading question…" />;

  const correctIdx = current.payload.answer_index;
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-white/55">
          Question {idx + 1} / {total}
        </p>
        {timed && picked === null && (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-bold tabular-nums text-amber-100">
            {secondsLeft}s
          </span>
        )}
      </div>
      <h2 className="mt-2 text-base font-semibold text-white">{current.payload.stem}</h2>
      <div className="mt-3 grid gap-2">
        {current.payload.options.map((opt, i) => {
          const isAnswer = i === correctIdx;
          const isPicked = i === picked;
          const tone = picked === null
            ? 'border-white/10 bg-white/[0.03] hover:bg-white/10'
            : isAnswer
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-50'
              : isPicked
                ? 'border-rose-400/50 bg-rose-500/15 text-rose-50'
                : 'border-white/10 bg-white/[0.03] text-white/55';
          return (
            <button
              key={i}
              onClick={() => onPick(i)}
              disabled={picked !== null}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${tone}`}
            >
              <span className="font-bold tabular-nums">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="mt-2 text-xs text-white/65">{current.payload.explanation}</p>
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
  return (
    <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-card/60 via-card/40 to-card/30 p-6 text-center shadow-soft">
      <p className="text-[10px] uppercase tracking-widest text-white/55">Match over</p>
      <h2 className="mt-2 text-2xl font-bold text-white">
        {myScore > oppScore ? 'You won!' : myScore < oppScore ? `${opp?.username ? `@${opp.username}` : 'Opponent'} won` : 'Draw'}
      </h2>
      <p className="mt-2 text-sm text-white/75">Final: {myScore} – {oppScore}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          onClick={onRematch}
          className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-4 py-2 text-xs font-semibold text-white shadow-glow"
        >
          Rematch
        </button>
        {opp?.username && (
          <Link
            to={`/u/${opp.username}`}
            className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs text-white hover:bg-white/10"
          >
            View @{opp.username}
          </Link>
        )}
        <Link
          to="/friends"
          className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs text-white hover:bg-white/10"
        >
          See all challenges
        </Link>
      </div>
    </article>
  );
}

function FinalNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-card/40 p-8 text-center">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1.5 text-sm text-white/65">{body}</p>
      <Link
        to="/discover"
        className="mt-5 inline-block rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2 text-xs font-semibold text-white shadow-glow"
      >
        Find someone else to challenge
      </Link>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="px-8 pb-32 pt-32 text-center text-sm text-white/55">{msg}</div>;
}
