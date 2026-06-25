import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { postEvent } from '@/lib/feed';
import { inferSubject } from '@/lib/subjects';
import { ttsUrl } from '@/lib/tts';
import { InterestButtons } from './InterestButtons';
import { QuickLearningSheet } from './QuickLearningSheet';
import { ReelVisual } from './ReelVisual';
import { ReelSubtitle } from './ReelSubtitle';
import { TutorPanel, type TutorContext } from './TutorPanel';
import type {
  ReelScript,
  VisualBeat,
  VisualKind,
  VisualSpec,
} from '../../../../../packages/shared-types/artifacts';

let AUDIO_UNLOCKED = false;
const AUDIO_UNLOCK_EVENT = 'reel-audio-unlocked';

const SPEEDS = [0.5, 1, 1.25, 1.5, 1.75, 2] as const;
type Speed = (typeof SPEEDS)[number];
const SPEED_STORAGE_KEY = 'neurofeed.reel.speed';
const MUTED_STORAGE_KEY = 'neurofeed.reel.muted';

function loadSavedSpeed(): Speed {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(SPEED_STORAGE_KEY);
  const n = Number(raw);
  return (SPEEDS as readonly number[]).includes(n) ? (n as Speed) : 1;
}

function loadSavedMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTED_STORAGE_KEY) === '1';
}

export function ReelCard({
  data,
  documentId,
  conceptId,
  artifactId,
  userId,
  onComplete,
  embedded = false,
}: {
  data: ReelScript;
  documentId?: string;
  conceptId?: string | null;
  artifactId?: string;
  userId?: string | null;
  onComplete?: () => void;
  /** When true, the reel is being rendered inside the in-feed card (not the
   * fullscreen overlay). Drops the safe-area + TopBar/BottomNav offsets so
   * chrome (progress bar, title block, right rail) sits on the card's
   * actual edges instead of floating in the middle. */
  embedded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Elapsed seconds inside this reel. Survives pause + visibility toggles.
  const elapsedRef = useRef(0);
  const startRef = useRef(0);
  // URL currently loaded into the <audio> element. Used to avoid re-loading
  // TTS (and resetting currentTime to 0) when only pause/resume toggles.
  const audioUrlRef = useRef<string | null>(null);

  const [visible, setVisible] = useState(false);
  const [unlocked, setUnlocked] = useState(() => AUDIO_UNLOCKED);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [activeDuration, setActiveDuration] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [speed, setSpeed] = useState<Speed>(() => loadSavedSpeed());
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [quickLearningOpen, setQuickLearningOpen] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => loadSavedMuted());
  const speedRef = useRef<Speed>(speed);
  const mutedRef = useRef<boolean>(muted);

  const reel = useMemo(() => normaliseReel(data), [data]);
  const hue = useMemo(
    () => hashHue(`${reel.topic}|${reel.title}|${reel.part_index ?? 0}`),
    [reel.topic, reel.title, reel.part_index],
  );

  // Active visual beat: ratio-synced to TTS so beats stay in step even when
  // the actual audio is faster or slower than the declared duration. The beat
  // changes when the elapsed RATIO crosses the next beat's at_sec ratio.
  const activeBeatIndex = useMemo(() => {
    const beats = reel.visual_beats;
    if (!beats || beats.length === 0) return 0;
    const playbackDur = activeDuration > 0 ? activeDuration : reel.duration_sec;
    if (playbackDur <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, elapsedSec / playbackDur));
    const narrationSec = ratio * reel.duration_sec;
    let idx = 0;
    for (let i = 0; i < beats.length; i++) {
      if (beats[i].at_sec <= narrationSec) idx = i;
      else break;
    }
    return idx;
  }, [reel.visual_beats, reel.duration_sec, elapsedSec, activeDuration]);

  // When beats are present, each beat's kind/spec stand on their own — never
  // mix with the reel-level kind/spec (that's beat 0's fallback for legacy
  // clients and would draw the wrong shape under a later beat's visual_kind).
  const activeBeat: VisualBeat | null =
    reel.visual_beats?.[activeBeatIndex] ?? null;
  const beatKind: VisualKind = activeBeat
    ? (activeBeat.visual_kind as VisualKind)
    : reel.visual_kind;
  const beatSpec: VisualSpec | null = activeBeat
    ? (activeBeat.visual_spec ?? null)
    : (reel.visual_spec ?? null);

  useEffect(() => {
    function onUnlock() { setUnlocked(true); }
    window.addEventListener(AUDIO_UNLOCK_EVENT, onUnlock);
    return () => window.removeEventListener(AUDIO_UNLOCK_EVENT, onUnlock);
  }, []);

  // Sync playback speed: update audio playbackRate, re-seed the fallback clock
  // so already-elapsed narrative seconds stay correct under the new rate, and
  // persist the choice across reels.
  useEffect(() => {
    speedRef.current = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
    startRef.current = performance.now() - (elapsedRef.current * 1000) / speed;
    try { window.localStorage.setItem(SPEED_STORAGE_KEY, String(speed)); } catch { /* ignore */ }
  }, [speed]);

  // Mute toggle: applies to the live audio element and persists across reels
  // so the user only sets it once per session.
  useEffect(() => {
    mutedRef.current = muted;
    if (audioRef.current) audioRef.current.muted = muted;
    try { window.localStorage.setItem(MUTED_STORAGE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  }, [muted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === el) setVisible(e.intersectionRatio >= 0.6);
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Restart playback when this reel scrolls back into view. When scrolling
  // away, only pause; don't reset until the next entrance.
  const wasVisible = useRef(false);
  const completedRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setProgress(0);
      setElapsedSec(0);
      setPaused(false);
      elapsedRef.current = 0;
      audioUrlRef.current = null;
      completedRef.current = false;
      setActiveDuration(reel.duration_sec);
      if (audioRef.current) audioRef.current.src = '';
      startRef.current = performance.now();
    } else if (!visible) {
      audioRef.current?.pause();
    }
    wasVisible.current = visible;
  }, [visible, reel.duration_sec]);

  // Pause/resume toggle: keep state intact, just control audio + clock.
  useEffect(() => {
    const a = audioRef.current;
    if (!visible) {
      a?.pause();
      return;
    }
    if (paused) {
      a?.pause();
      return;
    }
    startRef.current = performance.now() - (elapsedRef.current * 1000) / speedRef.current;
    if (a && audioUrlRef.current && a.paused) {
      a.playbackRate = speedRef.current;
      void a.play().catch(() => undefined);
    }
  }, [paused, visible]);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPaused(true);
    setProgress(1);
    onComplete?.();
    if (userId) {
      void postEvent(userId, 'reel_complete', {
        artifact_id: artifactId,
        document_id: documentId,
        concept_id: conceptId,
        duration_sec: Math.round(reel.duration_sec || elapsedRef.current),
      });
    }
  }, [reel.duration_sec, userId, artifactId, documentId, conceptId, onComplete]);

  // Playback: load TTS once, run animation tick while not paused. Audio onended
  // or progress >= 1 (fallback clock) marks the reel complete.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timer: number | undefined;
    let audioReady = audioUrlRef.current !== null;

    startRef.current = performance.now() - (elapsedRef.current * 1000) / speedRef.current;

    function tick() {
      if (cancelled) return;
      const a = audioRef.current;
      if (paused) return;
      if (audioReady && a && a.duration > 0 && !a.paused) {
        const p = Math.min(1, a.currentTime / a.duration);
        setProgress(p);
        setElapsedSec(a.currentTime);
        setActiveDuration(a.duration);
        elapsedRef.current = a.currentTime;
      } else {
        const dur = reel.duration_sec || 25;
        const elapsed =
          ((performance.now() - startRef.current) / 1000) * speedRef.current;
        elapsedRef.current = elapsed;
        const p = Math.min(1, elapsed / dur);
        setProgress(p);
        setElapsedSec(elapsed);
        setActiveDuration(dur);
        if (p >= 1) {
          finish();
          return;
        }
      }
      timer = window.setTimeout(tick, 90);
    }

    void (async () => {
      if (unlocked && !paused && !audioUrlRef.current) {
        try {
          const url = await ttsUrl(reel.narration);
          if (cancelled) return;
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;
          audio.src = url;
          audio.currentTime = elapsedRef.current;
          audio.playbackRate = speedRef.current;
          audio.muted = mutedRef.current;
          audio.onended = finish;
          audioUrlRef.current = url;
          await audio.play().catch(() => undefined);
          audioReady = true;
        } catch {
          audioReady = false;
        }
      }
      if (!cancelled && !paused) tick();
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, unlocked, paused, reel.narration]);

  // Keyboard: Space pause, F fullscreen, < / > speed.
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t && t.closest('[data-modal-root]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === '>' || (e.shiftKey && e.key === '.')) {
        e.preventDefault();
        bumpSpeed(1);
      } else if (e.key === '<' || (e.shiftKey && e.key === ',')) {
        e.preventDefault();
        bumpSpeed(-1);
      } else if (e.key === 'Escape') {
        setSpeedMenuOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, unlocked]);

  useEffect(() => {
    function onChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Hard stop on unmount. Without this, closing the fullscreen overlay (Esc or
  // the X button) tears down the visual layer but leaves the underlying
  // HTMLAudioElement playing — the in-flight .play() promise resolves after
  // teardown, so audio kept going with no UI. Pause + drop src kills both
  // current playback and any pending play() that's still resolving.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.onended = null;
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
      audioUrlRef.current = null;
    };
  }, []);

  function bumpSpeed(delta: 1 | -1) {
    setSpeed((current) => {
      const i = SPEEDS.indexOf(current);
      const next = Math.min(SPEEDS.length - 1, Math.max(0, i + delta));
      return SPEEDS[next];
    });
  }

  function togglePause() {
    if (!unlocked) {
      AUDIO_UNLOCKED = true;
      setUnlocked(true);
      window.dispatchEvent(new Event(AUDIO_UNLOCK_EVENT));
      setPaused(false);
      return;
    }
    setPaused((p) => !p);
  }

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen may be blocked; ignore.
    }
  }

  function onTapBackdrop(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [data-action]')) return;
    togglePause();
  }

  async function onShare() {
    const url = window.location.href;
    const title = reel.title || reel.topic;
    const text = `${title} — NeuroFeed`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // user cancelled
      }
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${url}`);
    } catch { /* best-effort */ }
  }

  async function onDownload() {
    try {
      const url = await ttsUrl(reel.narration);
      const transcript = `${reel.subtitle}\n${reel.narration}\n[audio: ${url}]`;
      const blob = new Blob(
        [`${reel.title || reel.topic}\n\n${transcript}`],
        { type: 'text/plain' },
      );
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${(reel.title || reel.topic).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch { /* best-effort */ }
  }

  const tutorContext: TutorContext = {
    topic: reel.topic,
    subtitle: reel.subtitle,
    narration: reel.narration,
    timestampSec: elapsedRef.current,
    documentId,
    conceptId,
  };

  const partLabel =
    reel.part_index && reel.part_total && reel.part_total > 1
      ? `Part ${reel.part_index}/${reel.part_total}`
      : null;

  return (
    <div
      ref={containerRef}
      onClick={onTapBackdrop}
      className="relative h-full w-full overflow-hidden text-white"
      style={{ background: bgGradient(hue) }}
    >
      {/* Educational visual fills the full frame. When the reel declares
          multiple visual_beats, AnimatePresence cross-fades between them on
          beat changes so the reel feels like a real video rather than one
          static frame under voiceover. Renderer keeps its content within a
          safe-area away from the subtitle band. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`beat-${activeBeatIndex}`}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <ReelVisual
            visualKind={beatKind}
            visualSpec={beatSpec}
            fallbackText={reel.subtitle}
            hue={hue}
          />
        </motion.div>
      </AnimatePresence>

      {/* Vignette so subtitles + chrome read against any visual. Bottom is
          darker so the left-bottom info panel stays legible. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/40" />

      {/* TOP: single progress bar for this reel. In fullscreen it sits below
          the floating TopHud; when embedded inline in the feed there's no
          TopHud above us, so we hug the card edge instead. */}
      <div
        className="absolute left-3 right-3 z-30"
        style={{ top: embedded ? '0.5rem' : 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full bg-white"
            style={{
              width: `${progress * 100}%`,
              transition: 'width 120ms linear',
            }}
          />
        </div>
      </div>

      {/* Karaoke subtitle band — the spoken caption layer. */}
      <ReelSubtitle
        narration={reel.narration}
        elapsedSec={elapsedSec}
        durationSec={activeDuration || reel.duration_sec || 25}
        highlight={reel.highlight_words}
        hue={hue}
      />

      {/* Pause overlay — central play glyph when paused. */}
      <AnimatePresence>
        {paused && unlocked && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/50 text-3xl backdrop-blur-md">
              ▶
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RIGHT RAIL — vertical action stack in Instagram-Reels order. When
          embedded inline we drop the BottomNav offset (the nav doesn't float
          over us inside a feed card) and trim the rail to the essentials so
          eight 48px buttons don't overflow a 4:5 thumbnail. */}
      <div
        className="absolute right-3 z-30 flex flex-col items-center gap-3"
        style={{ bottom: embedded ? '0.75rem' : 'calc(env(safe-area-inset-bottom, 0px) + 6.5rem)' }}
      >
        <RailBtn
          glyph={muted ? '🔇' : '🔊'}
          title={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted((m) => !m)}
        />
        {!embedded && (
          <RailBtn glyph="🎓" title="Quick Learning" onClick={() => setQuickLearningOpen(true)} accent />
        )}
        <RailBtn glyph="↗" title="Share" onClick={onShare} />
        {!embedded && (
          <RailBtn glyph="?" title="Ask AI" onClick={() => setTutorOpen(true)} />
        )}
        <InterestButtons
          userId={userId ?? null}
          target={{ artifactId, documentId, conceptId }}
        />
        {!embedded && (
          <SpeedRailBtn
            speed={speed}
            open={speedMenuOpen}
            onToggle={() => setSpeedMenuOpen((v) => !v)}
            onSelect={(s) => { setSpeed(s); setSpeedMenuOpen(false); }}
          />
        )}
        {!embedded && <RailBtn glyph="⬇" title="Download" onClick={onDownload} />}
        <RailBtn
          glyph={fullscreen ? '⤡' : '⛶'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={toggleFullscreen}
        />
      </div>

      {/* LEFT BOTTOM — creator + subject + topic + part marker. */}
      <div
        className="pointer-events-none absolute left-4 right-20 z-30 flex flex-col gap-1.5"
        style={{ bottom: embedded ? '0.75rem' : 'calc(env(safe-area-inset-bottom, 0px) + 6.5rem)' }}
      >
        <div className="pointer-events-auto flex items-center gap-2 text-[11px] font-medium text-white/85">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px]">N</span>
          <span>NeuroFeed</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/75">
            {inferSubject(reel.topic || reel.title)}
          </span>
          {partLabel && (
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white">
              {partLabel}
            </span>
          )}
        </div>
        <h2 className="line-clamp-2 text-[clamp(1rem,3.6vw,1.25rem)] font-bold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
          {reel.title || reel.topic}
        </h2>
      </div>

      <TutorPanel
        open={tutorOpen}
        ctx={tutorContext}
        onClose={() => setTutorOpen(false)}
      />

      <QuickLearningSheet
        open={quickLearningOpen}
        onClose={() => setQuickLearningOpen(false)}
        topic={reel.topic || reel.title}
        documentId={documentId}
        conceptId={conceptId ?? null}
        userId={userId ?? null}
        onOpenTutor={() => { setQuickLearningOpen(false); setTutorOpen(true); }}
      />
    </div>
  );
}

function RailBtn({
  glyph, onClick, title, accent = false,
}: { glyph: string; onClick: () => void; title: string; accent?: boolean }) {
  const base = accent
    ? 'border-accent/60 bg-accent/30 text-white hover:bg-accent/45'
    : 'border-white/15 bg-black/45 text-white hover:bg-black/60';
  return (
    <button
      title={title}
      aria-label={title}
      data-action
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`h-12 w-12 rounded-full border text-xl leading-none backdrop-blur transition-colors active:scale-95 ${base}`}
    >
      {glyph}
    </button>
  );
}

function SpeedRailBtn({
  speed, open, onToggle, onSelect,
}: {
  speed: Speed;
  open: boolean;
  onToggle: () => void;
  onSelect: (s: Speed) => void;
}) {
  return (
    <div className="relative">
      <button
        data-action
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="h-12 w-12 rounded-full border border-white/15 bg-black/45 text-[11px] font-semibold tabular-nums text-white backdrop-blur transition-colors active:scale-95 hover:bg-black/60"
        aria-label={`Playback speed ${speed}x`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Playback speed (Shift+> / Shift+<)"
      >
        {formatSpeed(speed)}x
      </button>
      <AnimatePresence>
        {open && (
          // Wrapper handles positioning (-translate-y-1/2 vertical centering)
          // while the inner motion element owns its own transform. Without the
          // split, framer-motion's `animate` writes a `transform` that
          // overrides the Tailwind translate, dropping the menu off-center so
          // some items (notably 1x, the second from top) land where users
          // don't expect to click.
          <div
            data-action
            className="pointer-events-auto absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, x: 8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 6, scale: 0.96 }}
              transition={{ duration: 0.14 }}
              role="menu"
              className="min-w-[7rem] overflow-hidden rounded-xl border border-white/10 bg-black/85 p-1 text-xs text-white shadow-xl backdrop-blur-lg"
            >
              {SPEEDS.map((s) => {
                const active = s === speed;
                return (
                  <button
                    key={s}
                    data-action
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(s);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left tabular-nums ${
                      active ? 'bg-white/15 font-semibold text-white' : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <span>{formatSpeed(s)}x</span>
                    {active && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -------- Legacy adapter --------
// Reads three reel shapes:
//   1. New flat reel with `visual_beats` — the LLM picks 2-4 timed shots.
//   2. New flat reel without `visual_beats` — render one beat for the whole
//      reel from the top-level visual_kind / visual_spec.
//   3. Old `{scenes:[…]}` — each scene already had its own visual, so we
//      lift the scenes into visual_beats with cumulative timings. Narration
//      gets concatenated since the new reel has one continuous voiceover.

type LegacyScene = {
  narration?: string;
  subtitle?: string;
  highlight_words?: string[];
  duration_sec?: number;
  visual_kind?: string;
  visual_spec?: Record<string, unknown> | null;
  animation_type?: string;
  caption?: string;
  voiceover?: string;
  explanation?: string;
};

type LegacyReel = Partial<ReelScript> & {
  hook?: string;
  scenes?: LegacyScene[];
};

function normaliseReel(data: LegacyReel): ReelScript {
  const legacyScenes = Array.isArray(data?.scenes) ? data!.scenes! : null;
  if (legacyScenes && legacyScenes.length > 0) {
    const first = legacyScenes[0];
    const narration = legacyScenes
      .map((s) => (s.narration ?? s.explanation ?? s.voiceover ?? '').trim())
      .filter(Boolean)
      .join(' ');
    const duration = legacyScenes.reduce(
      (acc, s) => acc + (typeof s.duration_sec === 'number' ? s.duration_sec : 6),
      0,
    );
    // Convert each scene into a timed visual beat with cumulative at_sec, so
    // old reels gain the new "video changes as it plays" behaviour for free.
    let cursor = 0;
    const beats: VisualBeat[] = legacyScenes.map((s) => {
      const at_sec = cursor;
      cursor += typeof s.duration_sec === 'number' && s.duration_sec > 0 ? s.duration_sec : 6;
      return {
        at_sec,
        visual_kind: (s.visual_kind as VisualKind) ?? 'flowchart',
        visual_spec: (s.visual_spec ?? null) as VisualSpec | null,
        animation_type:
          (s.animation_type as ReelScript['animation_type']) ?? 'fade',
        caption_anchor: s.subtitle ?? s.caption ?? null,
      };
    });
    return {
      topic: data.topic ?? 'Reel',
      title: data.title ?? data.topic ?? 'Reel',
      narration: narration || first.subtitle || data.hook || 'This reel has no content yet.',
      subtitle: first.subtitle ?? first.caption ?? 'Reel',
      highlight_words: Array.isArray(first.highlight_words) ? first.highlight_words : [],
      duration_sec: duration > 0 ? duration : 25,
      visual_kind: (first.visual_kind as ReelScript['visual_kind']) ?? 'flowchart',
      visual_spec: (first.visual_spec ?? null) as ReelScript['visual_spec'],
      animation_type: (first.animation_type as ReelScript['animation_type']) ?? 'fade',
      music_mood: (data.music_mood as ReelScript['music_mood']) ?? 'curious',
      visual_beats: beats,
      part_index: null,
      part_total: null,
    };
  }

  const duration =
    typeof data.duration_sec === 'number' && data.duration_sec > 0
      ? data.duration_sec
      : 25;

  return {
    topic: data.topic ?? 'Reel',
    title: data.title ?? data.topic ?? 'Reel',
    narration: (data.narration ?? '').trim() || 'This reel has no narration yet.',
    subtitle: (data.subtitle ?? data.title ?? 'Reel').toString(),
    highlight_words: Array.isArray(data.highlight_words) ? data.highlight_words : [],
    duration_sec: duration,
    visual_kind: (data.visual_kind as ReelScript['visual_kind']) ?? 'flowchart',
    visual_spec: (data.visual_spec ?? null) as ReelScript['visual_spec'],
    animation_type: (data.animation_type as ReelScript['animation_type']) ?? 'fade',
    music_mood: (data.music_mood as ReelScript['music_mood']) ?? 'curious',
    visual_beats: sanitiseBeats(data.visual_beats, duration),
    part_index: data.part_index ?? null,
    part_total: data.part_total ?? null,
  };
}

// Drop malformed beats, force first beat to at_sec=0, sort by at_sec, and
// strip beats whose at_sec runs past duration. Returns null when no usable
// beats remain so the player falls back to the flat top-level visual.
function sanitiseBeats(
  raw: VisualBeat[] | null | undefined,
  duration: number,
): VisualBeat[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cleaned = raw
    .filter((b): b is VisualBeat => !!b && typeof b.at_sec === 'number')
    .map((b) => ({
      at_sec: Math.max(0, Math.min(duration, b.at_sec)),
      visual_kind: (b.visual_kind as VisualKind) ?? 'flowchart',
      visual_spec: (b.visual_spec ?? null) as VisualSpec | null,
      animation_type:
        (b.animation_type as ReelScript['animation_type']) ?? 'fade',
      caption_anchor: b.caption_anchor ?? null,
    }))
    .sort((a, b) => a.at_sec - b.at_sec);
  if (cleaned.length === 0) return null;
  // The first beat must start the reel.
  cleaned[0].at_sec = 0;
  // Drop duplicates / beats too close together (< 1.5 s apart).
  const out: VisualBeat[] = [cleaned[0]];
  for (let i = 1; i < cleaned.length; i++) {
    const prev = out[out.length - 1];
    if (cleaned[i].at_sec - prev.at_sec >= 1.5) out.push(cleaned[i]);
  }
  return out.length > 0 ? out : null;
}

function formatSpeed(s: number): string {
  return Number.isInteger(s) ? String(s) : String(s).replace(/^0/, '');
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function bgGradient(hue: number): string {
  return `radial-gradient(120% 80% at 20% 10%, hsl(${hue} 65% 14%) 0%, transparent 60%), radial-gradient(120% 80% at 80% 90%, hsl(${(hue + 80) % 360} 65% 16%) 0%, transparent 60%), linear-gradient(160deg, #0a0e18 0%, #03050a 100%)`;
}
