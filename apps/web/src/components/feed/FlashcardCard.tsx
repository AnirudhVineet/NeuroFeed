import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Flashcard } from '../../../../../packages/shared-types/artifacts';

export function FlashcardCard({ data }: { data: Flashcard }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className="h-full w-full flex items-center justify-center p-6"
      style={{ perspective: 1200 }}
      onClick={() => setFlipped((v) => !v)}
    >
      <motion.div
        className="relative w-full max-w-md aspect-[3/4] rounded-3xl cursor-pointer"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
      >
        <Face front>
          <div className="text-xs uppercase tracking-widest text-accent mb-3">Question</div>
          <p className="text-2xl text-center">{data.question}</p>
          <div className="absolute bottom-4 text-xs text-muted">tap to flip</div>
        </Face>
        <Face>
          <div className="text-xs uppercase tracking-widest text-accent mb-3">Answer</div>
          <p className="text-xl text-center">{data.answer}</p>
        </Face>
      </motion.div>
    </div>
  );
}

function Face({ front, children }: { front?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-6 flex flex-col items-center justify-center"
      style={{
        backfaceVisibility: 'hidden',
        transform: front ? 'rotateY(0deg)' : 'rotateY(180deg)',
      }}
    >
      {children}
    </div>
  );
}
