import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGamify } from '@/state/gamify';

const LABELS: Record<string, string> = {
  first_upload: 'First Upload',
  quiz_5: '5 Quiz Correct',
  quiz_25: '25 Quiz Correct',
  binge_3: 'Reel Binge',
  curious_10: 'Curious Mind',
};

export function AchievementToast() {
  const unlocked = useGamify((s) => s.unlocked);
  const clear = useGamify((s) => s.clearUnlocked);

  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(clear, 3500);
    return () => clearTimeout(t);
  }, [unlocked, clear]);

  return (
    <AnimatePresence>
      {unlocked && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow-lg"
        >
          ✨ {LABELS[unlocked] ?? unlocked}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
