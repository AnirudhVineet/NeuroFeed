import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReelScript } from '../../../../../packages/shared-types/artifacts';

export function ReelCard({ data }: { data: ReelScript }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const scene = data.scenes[sceneIdx];

  useEffect(() => {
    if (!scene) return;
    const t = setTimeout(
      () => setSceneIdx((i) => (i + 1) % data.scenes.length),
      scene.duration_sec * 1000,
    );
    return () => clearTimeout(t);
  }, [sceneIdx, scene, data.scenes.length]);

  if (!scene) return null;
  return (
    <div className="h-full w-full relative overflow-hidden bg-gradient-to-br from-indigo-900 via-ink to-fuchsia-900">
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

      {/* Tier-2 will add Kokoro/edge-tts narration on top of this; Tier-1 here is silent. */}
      <div className="absolute top-3 left-3 right-3 flex gap-1">
        {data.scenes.map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded bg-white/15 overflow-hidden">
            <div
              className="h-full bg-white"
              style={{ width: i < sceneIdx ? '100%' : i === sceneIdx ? '50%' : 0 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
