import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { postEvent } from '@/lib/feed';
import { ttsUrl } from '@/lib/tts';
import { InterestButtons } from './InterestButtons';
import { SceneVisual } from './SceneVisual';
import { SceneSubtitle } from './SceneSubtitle';
import { TutorPanel, type TutorContext } from './TutorPanel';
import type {
  AnimationType,
  ReelScene,
  ReelScript,
  SceneType,
  TransitionType,
} from '../../../../../packages/shared-types/artifacts';

let AUDIO_UNLOCKED = false;
const AUDIO_UNLOCK_EVENT = 'reel-audio-unlocked';

const SPEEDS = [0.5, 1, 1.25, 1.5, 1.75, 2] as const;
type Speed = (typeof SPEEDS)[number];
const SPEED_STORAGE_KEY = 'neurofeed.reel.speed';

function loadSavedSpeed(): Speed {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(SPEED_STORAGE_KEY);
  const n = Number(raw);
  return (SPEEDS as readonly number[]).includes(n) ? (n as Speed) : 1;
}

export function ReelCard({
  data,
  documentId,
  conceptId,
  artifactId,
  userId,
  onComplete,
}: {
  data: ReelScript;
  documentId?: string;
  conceptId?: string | null;
  artifactId?: string;
  userId?: string | null;
  onComplete?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Scene-local elapsed seconds. Survives pause + visibility toggles for the
  // current scene; resets only on scene change.
  const elapsedRef = useRef(0);
  const sceneStartRef = useRef(0);
  // URL currently loaded into the <audio> element. Used to avoid re-loading
  // TTS (and resetting currentTime to 0) when only pause/resume toggles.
  const audioUrlRef = useRef<string | null>(null);

  const [sceneIdx, setSceneIdx] = useState(0);
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
  const speedRef = useRef<Speed>(speed);

  const normalised = useMemo(() => normaliseReel(data), [data]);
  const scenes = normalised.scenes;
  const scene = scenes[sceneIdx] ?? scenes[0];
  const hue = useMemo(
    () => hashHue(`${data.topic}|${scene?.scene_type ?? ''}|${sceneIdx}`),
    [data.topic, scene?.scene_type, sceneIdx],
  );

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
    sceneStartRef.current = performance.now() - (elapsedRef.current * 1000) / speed;
    try { window.localStorage.setItem(SPEED_STORAGE_KEY, String(speed)); } catch { /* ignore */ }
  }, [speed]);

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

  // Reset scene to 0 when reel scrolls back into view. When scrolling away,
  // only pause; don't reset until next entrance.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setSceneIdx(0);
      setProgress(0);
      setElapsedSec(0);
      setPaused(false);
      elapsedRef.current = 0;
      audioUrlRef.current = null;
      completedRef.current = false;
      if (audioRef.current) audioRef.current.src = '';
      sceneStartRef.current = performance.now();
    } else if (!visible) {
      audioRef.current?.pause();
    }
    wasVisible.current = visible;
  }, [visible]);

  // Reset elapsed on scene change.
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    setElapsedSec(0);
    setActiveDuration(scene?.duration_sec ?? 6);
    sceneStartRef.current = performance.now();
    audioUrlRef.current = null;
    setSpeedMenuOpen(false);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = '';
    }
  }, [sceneIdx, scene]);

  // Pause/resume toggle: keep state intact, just control audio + clock.
  useEffect(() => {
    const a = audioRef.current;
    if (!visible || !scene) {
      a?.pause();
      return;
    }
    if (paused) {
      a?.pause();
      return;
    }
    sceneStartRef.current = performance.now() - (elapsedRef.current * 1000) / speedRef.current;
    if (a && audioUrlRef.current && a.paused) {
      a.playbackRate = speedRef.current;
      void a.play().catch(() => undefined);
    }
  }, [paused, visible, scene]);

  const completedRef = useRef(false);
  const advance = useCallback(() => {
    setSceneIdx((idx) => {
      if (idx < scenes.length - 1) return idx + 1;
      setPaused(true);
      setProgress(1);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
        if (userId) {
          const totalDuration = scenes.reduce(
            (acc, s) => acc + (s.duration_sec || 6),
            0,
          );
          void postEvent(userId, 'reel_complete', {
            artifact_id: artifactId,
            document_id: documentId,
            concept_id: conceptId,
            duration_sec: Math.round(totalDuration),
          });
        }
      }
      return idx;
    });
  }, [scenes, userId, artifactId, documentId, conceptId, onComplete]);

  // Scene playback: load TTS once per scene, run animation tick while not paused.
  useEffect(() => {
    if (!visible || !scene) return;
    let cancelled = false;
    let timer: number | undefined;
    let audioReady = audioUrlRef.current !== null;

    sceneStartRef.current = performance.now() - (elapsedRef.current * 1000) / speedRef.current;

    function tick() {
      if (cancelled) return;
      const a = audioRef.current;
      if (paused) return;
      if (audioReady && a && a.duration > 0 && !a.paused) {
        // audio.duration is the natural duration; currentTime advances at
        // playbackRate, so the ratio is still the right progress and the
        // remaining wall-clock is (duration - currentTime) / playbackRate.
        const p = Math.min(1, a.currentTime / a.duration);
        setProgress(p);
        setElapsedSec(a.currentTime);
        setActiveDuration(a.duration);
        elapsedRef.current = a.currentTime;
      } else {
        const dur = scene.duration_sec || 6;
        const elapsed =
          ((performance.now() - sceneStartRef.current) / 1000) * speedRef.current;
        elapsedRef.current = elapsed;
        const p = Math.min(1, elapsed / dur);
        setProgress(p);
        setElapsedSec(elapsed);
        setActiveDuration(dur);
        if (p >= 1) {
          advance();
          return;
        }
      }
      timer = window.setTimeout(tick, 90);
    }

    void (async () => {
      if (unlocked && !paused && !audioUrlRef.current) {
        try {
          const url = await ttsUrl(scene.narration);
          if (cancelled) return;
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;
          audio.src = url;
          audio.currentTime = elapsedRef.current;
          audio.playbackRate = speedRef.current;
          audio.onended = advance;
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
  }, [visible, unlocked, sceneIdx, scenes.length, paused]);

  // Keyboard within reel: Space pause, ← → scene nav.
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t && t.closest('[data-modal-root]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToScene(Math.max(0, sceneIdx - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToScene(Math.min(scenes.length - 1, sceneIdx + 1));
      } else if (e.key === ' ') {
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
  }, [visible, sceneIdx, scenes.length, unlocked]);

  useEffect(() => {
    function onChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function jumpToScene(idx: number) {
    setSceneIdx(idx);
    setPaused(false);
  }

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
    const title = normalised.title || normalised.topic;
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
      const urls = await Promise.all(scenes.map((s) => ttsUrl(s.narration)));
      const transcript = scenes
        .map(
          (s, i) =>
            `Scene ${i + 1} — ${s.subtitle}\n${s.narration}\n[audio: ${urls[i]}]`,
        )
        .join('\n\n');
      const blob = new Blob(
        [`${normalised.title || normalised.topic}\n\n${transcript}`],
        { type: 'text/plain' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(normalised.title || normalised.topic).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { /* best-effort */ }
  }

  const tutorContext: TutorContext = {
    topic: normalised.topic,
    sceneType: scene?.scene_type,
    sceneSubtitle: scene?.subtitle,
    sceneNarration: scene?.narration,
    sceneIndex: sceneIdx,
    totalScenes: scenes.length,
    timestampSec: elapsedRef.current,
    documentId,
    conceptId,
  };

  if (!scene) return null;

  return (
    <div
      ref={containerRef}
      onClick={onTapBackdrop}
      className="relative h-full w-full overflow-hidden text-white"
      style={{ background: bgGradient(hue) }}
    >
      {/* Layer 1 + 2: visual scene fills the full frame; renderer keeps its
          content within a safe-area away from the subtitle band. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${sceneIdx}`}
          {...transitionVariant(scene.transition_type)}
          className="absolute inset-0"
        >
          <SceneVisual scene={scene} hue={hue} sceneKey={`v-${sceneIdx}`} />
        </motion.div>
      </AnimatePresence>

      {/* Layer 1: vignette so subtitles + UI chrome read against any visual. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/45" />

      {/* Layer 6: scene progress bars */}
      <div className="absolute left-4 right-24 top-14 z-30 flex gap-1">
        {scenes.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-white"
              style={{
                width: i < sceneIdx ? '100%' : i === sceneIdx ? `${progress * 100}%` : '0%',
                transition: i === sceneIdx ? 'width 120ms linear' : 'width 300ms ease',
              }}
            />
          </div>
        ))}
      </div>

      {/* Top: scene meta */}
      <div className="absolute left-4 right-24 top-20 z-30 flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/55">
          {(scene.scene_type ?? 'scene').replace('_', ' ')}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-white/80">
          {normalised.title || normalised.topic}
        </h3>
        <span className="text-[11px] tabular-nums text-white/55">
          {sceneIdx + 1}/{scenes.length}
        </span>
      </div>

      {/* Layer 4: scene title — compact header above the visual content. The
          visual itself is the star; this is just a punchy label. */}
      <div className="pointer-events-none absolute left-4 right-24 top-28 z-30 max-h-[14vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`title-${sceneIdx}`}
            {...transitionVariant(scene.transition_type)}
            className="flex max-w-[min(94vw,520px)] flex-col gap-1.5"
          >
            <SceneTitle
              text={scene.subtitle}
              kind={scene.animation_type}
              highlight={scene.highlight_words}
              hue={hue}
              sceneType={scene.scene_type}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Layer 5: subtitle band — karaoke narration near the bottom. */}
      <SceneSubtitle
        narration={scene.narration}
        elapsedSec={elapsedSec}
        durationSec={activeDuration || scene.duration_sec || 6}
        highlight={scene.highlight_words}
        hue={hue}
      />

      {/* Pause overlay */}
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

      {/* Scene dots */}
      <div className="absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
        {scenes.map((_, i) => (
          <button
            key={i}
            data-action
            onClick={(e) => { e.stopPropagation(); jumpToScene(i); }}
            className={`h-1.5 rounded-full transition-all ${
              i === sceneIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
            }`}
            aria-label={`Go to scene ${i + 1}`}
          />
        ))}
      </div>

      {/* Pause/play + speed cluster (bottom-left) */}
      <div className="absolute bottom-[5.5rem] left-4 z-30 flex items-center gap-2">
        <button
          data-action
          onClick={(e) => { e.stopPropagation(); togglePause(); }}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur hover:bg-black/60"
          aria-label={paused || !unlocked ? 'Play' : 'Pause'}
        >
          <span className="text-sm leading-none">{paused || !unlocked ? '▶' : '❚❚'}</span>
          <span>{!unlocked ? 'Play' : paused ? 'Play' : 'Pause'}</span>
        </button>
        <div className="relative">
          <button
            data-action
            onClick={(e) => { e.stopPropagation(); setSpeedMenuOpen((v) => !v); }}
            className="inline-flex items-center rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-semibold tabular-nums text-white/90 backdrop-blur hover:bg-black/60"
            aria-label={`Playback speed ${speed}x`}
            aria-haspopup="menu"
            aria-expanded={speedMenuOpen}
            title="Playback speed (Shift+> / Shift+<)"
          >
            {formatSpeed(speed)}x
          </button>
          <AnimatePresence>
            {speedMenuOpen && (
              <motion.div
                data-action
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={{ duration: 0.14 }}
                role="menu"
                className="absolute bottom-full left-0 z-40 mb-2 min-w-[7rem] overflow-hidden rounded-xl border border-white/10 bg-black/85 p-1 text-xs text-white shadow-xl backdrop-blur-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {SPEEDS.map((s) => {
                  const active = s === speed;
                  return (
                    <button
                      key={s}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setSpeed(s);
                        setSpeedMenuOpen(false);
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
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right action rail */}
      <div className="absolute right-3 bottom-24 z-30 flex flex-col items-center gap-3">
        <InterestButtons
          userId={userId ?? null}
          target={{ artifactId, documentId, conceptId }}
        />
        <RailBtn label="↗" title="Share" onClick={onShare} />
        <RailBtn label="?" title="Ask AI Tutor" onClick={() => setTutorOpen(true)} />
        <RailBtn label="⬇" title="Download" onClick={onDownload} />
        <RailBtn label={fullscreen ? '⤡' : '⛶'} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} />
      </div>

      <TutorPanel
        open={tutorOpen}
        ctx={tutorContext}
        onClose={() => setTutorOpen(false)}
      />
    </div>
  );
}

function RailBtn({
  label, onClick, title,
}: { label: string; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      data-action
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="h-11 w-11 rounded-full border border-white/15 bg-black/45 text-xl leading-none text-white backdrop-blur hover:bg-black/60"
    >
      {label}
    </button>
  );
}

// -------- Scene title (compact header at top of visual area) --------

function SceneTitle({
  text,
  kind,
  highlight,
  hue,
  sceneType,
}: {
  text: string;
  kind: AnimationType;
  highlight: string[];
  hue: number;
  sceneType: SceneType;
}) {
  const safeText = text ?? '';
  const safeHighlight = highlight ?? [];
  const variants = subtitleVariants(kind);
  const baseStyle = sceneType === 'hook'
    ? 'text-[clamp(1.15rem,4.4vw,1.7rem)] font-extrabold leading-tight tracking-tight'
    : 'text-[clamp(1rem,3.6vw,1.4rem)] font-bold leading-tight tracking-tight';

  if (kind === 'kinetic_text') {
    const words = safeText.split(/\s+/);
    return (
      <motion.div
        className={`${baseStyle} drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]`}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
        }}
      >
        {words.map((w, i) => (
          <motion.span
            key={i}
            className="mr-1.5 inline-block"
            variants={{
              hidden: { opacity: 0, y: 14, scale: 0.9 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 22 } },
            }}
          >
            {renderHighlighted(w, safeHighlight, hue, i)}
          </motion.span>
        ))}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`${baseStyle} drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]`}
      {...variants}
    >
      <Highlighted text={safeText} highlight={safeHighlight} hue={hue} />
    </motion.div>
  );
}

function renderHighlighted(word: string, highlight: string[], hue: number, key: number) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isHit = highlight.some((h) => norm(h) === norm(word));
  if (!isHit) return <span key={key}>{word}</span>;
  return (
    <span
      key={key}
      className="rounded-md px-1 py-0.5"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 80% 55% / 0.6), hsl(${(hue + 60) % 360} 80% 55% / 0.6))`,
        boxShadow: `0 0 18px hsl(${hue} 80% 60% / 0.45)`,
      }}
    >
      {word}
    </span>
  );
}

function Highlighted({ text, highlight, hue }: { text: string; highlight: string[]; hue: number }) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((t, i) =>
        /\s+/.test(t) ? t : renderHighlighted(t, highlight, hue, i),
      )}
    </>
  );
}

// -------- Motion variants --------

type MotionSpec = {
  initial: Record<string, number | string>;
  animate: Record<string, number | string>;
  transition: { duration: number; ease: readonly number[] };
};

type TransitionSpec = MotionSpec & { exit: Record<string, number | string> };

function subtitleVariants(kind: AnimationType): MotionSpec {
  const t = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };
  switch (kind) {
    case 'zoom_in':
      return { initial: { opacity: 0, scale: 0.7 }, animate: { opacity: 1, scale: 1 }, transition: t };
    case 'zoom_out':
      return { initial: { opacity: 0, scale: 1.25 }, animate: { opacity: 1, scale: 1 }, transition: t };
    case 'slide_left':
      return { initial: { opacity: 0, x: 80 }, animate: { opacity: 1, x: 0 }, transition: t };
    case 'slide_right':
      return { initial: { opacity: 0, x: -80 }, animate: { opacity: 1, x: 0 }, transition: t };
    case 'slide_up':
      return { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: t };
    case 'scale_up':
      return { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, transition: t };
    case 'highlight':
      return { initial: { opacity: 0, filter: 'blur(6px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, transition: t };
    case 'split':
      return { initial: { opacity: 0, scaleX: 0 }, animate: { opacity: 1, scaleX: 1 }, transition: t };
    case 'pulse':
      return { initial: { opacity: 0, scale: 1.05 }, animate: { opacity: 1, scale: 1 }, transition: t };
    case 'type_writer':
    case 'fade':
    default:
      return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: t };
  }
}

function transitionVariant(kind: TransitionType): TransitionSpec {
  const t = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };
  switch (kind) {
    case 'slide':
      return {
        initial: { opacity: 0, x: 60 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -60 },
        transition: t,
      };
    case 'zoom':
      return {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.05 },
        transition: t,
      };
    case 'wipe':
      return {
        initial: { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
        animate: { opacity: 1, clipPath: 'inset(0 0% 0 0)' },
        exit: { opacity: 0, clipPath: 'inset(0 0 0 100%)' },
        transition: t,
      };
    case 'morph':
      return {
        initial: { opacity: 0, scale: 1.06, filter: 'blur(8px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.96, filter: 'blur(6px)' },
        transition: t,
      };
    case 'fade':
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: t,
      };
  }
}

// -------- Legacy adapter --------

type LegacyScene = Partial<ReelScene> & {
  caption?: string;
  voiceover?: string;
  visual_hint?: string;
  title?: string;
  explanation?: string;
  bullet_points?: string[];
  example?: string;
  analogy?: string;
  key_takeaway?: string;
};

function normaliseReel(data: ReelScript & Partial<{ title: string; hook: string }>): ReelScript {
  const rawScenes = (data?.scenes ?? []) as LegacyScene[];
  const scenes: ReelScene[] = rawScenes.map((s, i) => {
    const subtitle = s.subtitle ?? s.caption ?? s.title ?? `Scene ${i + 1}`;
    const narrationParts = [s.narration, s.explanation, s.voiceover]
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
    const narration = narrationParts ?? subtitle;
    return {
      scene_type: s.scene_type ?? defaultSceneType(i, rawScenes.length),
      narration,
      subtitle,
      image_prompt: s.image_prompt ?? s.visual_hint ?? '',
      animation_type: s.animation_type ?? 'fade',
      transition_type: s.transition_type ?? 'fade',
      highlight_words: Array.isArray(s.highlight_words) ? s.highlight_words : [],
      duration_sec: typeof s.duration_sec === 'number' && s.duration_sec > 0 ? s.duration_sec : 6,
      visual_kind: s.visual_kind ?? 'flowchart',
      visual_spec: s.visual_spec ?? null,
    };
  });
  return {
    topic: data?.topic ?? 'Reel',
    title: data?.title ?? data?.topic ?? 'Reel',
    hook: data?.hook ?? '',
    music_mood: data?.music_mood ?? 'curious',
    scenes: scenes.length > 0 ? scenes : [
      {
        scene_type: 'summary',
        narration: 'This reel has no scenes yet.',
        subtitle: 'No scenes',
        image_prompt: '',
        animation_type: 'fade',
        transition_type: 'fade',
        highlight_words: [],
        duration_sec: 5,
        visual_kind: 'flowchart',
        visual_spec: null,
      },
    ],
  };
}

function defaultSceneType(i: number, total: number): SceneType {
  if (i === 0) return 'hook';
  if (i === total - 1) return 'summary';
  const order: SceneType[] = ['problem', 'concept', 'visualization', 'example', 'analogy', 'fun_fact', 'application'];
  return order[(i - 1) % order.length];
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

export type { ReelScene };
