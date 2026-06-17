import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ttsUrl } from '@/lib/tts';
import type { ReelScript } from '../../../../../packages/shared-types/artifacts';

export function ReelCard({ data }: { data: ReelScript }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scene = data.scenes[sceneIdx];

  // Preload next scene's audio so transitions feel snappy.
  useEffect(() => {
    if (!unlocked) return;
    const next = data.scenes[sceneIdx + 1];
    if (next) void ttsUrl(next.voiceover).catch(() => {});
  }, [unlocked, sceneIdx, data.scenes]);

  useEffect(() => {
    if (!unlocked || !scene) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = await ttsUrl(scene.voiceover);
        if (cancelled) return;
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.src = url;
        audio.onended = () => {
          if (!cancelled) setSceneIdx((i) => (i + 1) % data.scenes.length);
        };
        await audio.play();
      } catch {
        // fallback: advance on duration_sec
        const t = setTimeout(
          () => !cancelled && setSceneIdx((i) => (i + 1) % data.scenes.length),
          scene.duration_sec * 1000,
        );
        return () => clearTimeout(t);
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [unlocked, sceneIdx, scene, data.scenes.length]);

  if (!scene) return null;

  return (
    <div
      className="h-full w-full relative overflow-hidden bg-gradient-to-br from-indigo-900 via-ink to-fuchsia-900"
      onClick={() => !unlocked && setUnlocked(true)}
    >
      <motion.div
        key={sceneIdx}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 flex items-center justify-center p-8 text-center"
      >
        <div className="max-w-md">
          <div className="text-xs text-white/60 uppercase tracking-widest mb-3">
            scene {sceneIdx + 1} / {data.scenes.length}
          </div>
          <h2 className="text-3xl font-bold mb-4">{scene.caption}</h2>
          <p className="text-white/80">{scene.voiceover}</p>
        </div>
      </motion.div>

      <div className="absolute top-3 left-3 right-3 flex gap-1">
        {data.scenes.map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded bg-white/15 overflow-hidden">
            <div
              className="h-full bg-white transition-all"
              style={{ width: i < sceneIdx ? '100%' : i === sceneIdx ? '50%' : 0 }}
            />
          </div>
        ))}
      </div>

      {!unlocked && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <button className="rounded-full bg-accent px-5 py-3 text-sm font-semibold">
            Tap to play
          </button>
        </div>
      )}
    </div>
  );
}
