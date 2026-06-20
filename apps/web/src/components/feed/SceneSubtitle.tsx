import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Karaoke-style subtitle band. Chunks narration into short (≤7-word) lines,
// times them off scene elapsed seconds, and highlights the currently spoken
// word. Stays under 15% of viewport height per the design spec.

export function SceneSubtitle({
  narration,
  elapsedSec,
  durationSec,
  highlight,
  hue,
}: {
  narration: string;
  elapsedSec: number;
  durationSec: number;
  highlight: string[];
  hue: number;
}) {
  const safeText = (narration ?? '').trim();
  const chunks = useMemo(() => splitChunks(safeText, 7), [safeText]);
  const totalWords = useMemo(
    () => chunks.reduce((acc, c) => acc + c.length, 0),
    [chunks],
  );
  const dur = Math.max(0.5, durationSec || (totalWords / 2.6));
  const elapsed = Math.max(0, Math.min(dur, elapsedSec));

  if (!safeText || chunks.length === 0) return null;

  // Word-level timing: distribute words uniformly across duration. The current
  // word and current chunk fall out of one shared index.
  const wps = totalWords / dur;
  const currentWordIdx = Math.min(totalWords - 1, Math.floor(elapsed * wps));

  let activeChunkIdx = 0;
  let chunkWordStart = 0;
  {
    let acc = 0;
    for (let i = 0; i < chunks.length; i++) {
      const w = chunks[i].length;
      if (currentWordIdx < acc + w) {
        activeChunkIdx = i;
        chunkWordStart = acc;
        break;
      }
      acc += w;
    }
    // If past the end, pin to the last chunk.
    if (currentWordIdx >= totalWords) {
      activeChunkIdx = chunks.length - 1;
      let acc2 = 0;
      for (let i = 0; i < activeChunkIdx; i++) acc2 += chunks[i].length;
      chunkWordStart = acc2;
    }
  }

  const chunk = chunks[activeChunkIdx];
  const wordIdxInChunk = currentWordIdx - chunkWordStart;
  const highlightSet = new Set(highlight.map(norm));
  const accentColor = `hsl(${hue} 95% 75%)`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7.5rem] z-20 flex justify-center px-4">
      <div className="w-full max-w-[min(94vw,560px)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`sub-${activeChunkIdx}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto rounded-2xl border border-white/10 bg-black/55 px-4 py-2.5 text-center text-[clamp(1.05rem,3.6vw,1.45rem)] font-semibold leading-snug text-white shadow-lg backdrop-blur-md"
            style={{
              boxShadow: `0 6px 24px rgba(0,0,0,0.4), 0 0 28px hsl(${hue} 80% 35% / 0.35)`,
            }}
          >
            {chunk.map((w, i) => {
              const cleaned = norm(w);
              const isCurrent = i === wordIdxInChunk;
              const isSpoken = i < wordIdxInChunk;
              const isHighlight = highlightSet.has(cleaned);
              return (
                <span
                  key={i}
                  className="mr-1.5 inline-block transition-colors"
                  style={{
                    color: isCurrent
                      ? accentColor
                      : isHighlight
                        ? '#fff'
                        : isSpoken
                          ? 'rgba(255,255,255,0.95)'
                          : 'rgba(255,255,255,0.5)',
                    textShadow: isCurrent
                      ? `0 0 16px ${accentColor}`
                      : isHighlight
                        ? `0 0 10px hsl(${(hue + 40) % 360} 80% 65% / 0.6)`
                        : 'none',
                    fontWeight: isCurrent || isHighlight ? 800 : 600,
                  }}
                >
                  {w}
                </span>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Split narration into short subtitle lines. Prefer breaking at sentence
// punctuation; fall back to a fixed word cap.
function splitChunks(text: string, maxWords: number): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    const endsSentence = /[.!?]$/.test(w);
    const endsClause = /[,;:]$/.test(w);
    if (cur.length >= maxWords) {
      chunks.push(cur);
      cur = [];
    } else if (endsSentence && cur.length >= 3) {
      chunks.push(cur);
      cur = [];
    } else if (endsClause && cur.length >= 5) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
