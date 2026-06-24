import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Flashcard } from '../../../../../packages/shared-types/artifacts';

// Inline flashcard. 3:4 ratio so it reads as a card without dominating the
// feed. Tap to flip; uses the standard light-surface card frame.
export function FlashcardCard({ data }: { data: Flashcard }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-md">
      <div className="mb-sm flex items-center justify-between text-label-sm text-on-surface-variant">
        <span className="uppercase tracking-widest">Flashcard</span>
        {data.difficulty && (
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] uppercase tracking-widest">
            {data.difficulty}
          </span>
        )}
      </div>
      <div
        className="relative aspect-[3/4] w-full cursor-pointer select-none"
        style={{ perspective: 1200 }}
        onClick={() => setFlipped((v) => !v)}
      >
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        >
          <Face front>
            <div className="mb-sm text-label-sm uppercase tracking-widest text-primary">Question</div>
            <p className="text-center text-headline-sm text-on-surface">{data.question}</p>
            <div className="absolute bottom-3 text-[11px] text-outline">tap to flip</div>
          </Face>
          <Face>
            <div className="mb-sm text-label-sm uppercase tracking-widest text-primary">Answer</div>
            <p className="text-center text-body-lg text-on-surface">{data.answer}</p>
          </Face>
        </motion.div>
      </div>
    </div>
  );
}

function Face({ front, children }: { front?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low p-md"
      style={{
        backfaceVisibility: 'hidden',
        transform: front ? 'rotateY(0deg)' : 'rotateY(180deg)',
      }}
    >
      {children}
    </div>
  );
}
