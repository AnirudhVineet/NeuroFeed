import { useState } from 'react';
import type { QuizItem } from '../../../../../packages/shared-types/artifacts';

export function QuizCard({
  data,
  onAnswer,
}: {
  data: QuizItem;
  onAnswer?: (chosen: number, correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const correct = picked === data.answer_index;
  return (
    <div className="h-full w-full flex flex-col p-6 max-w-md mx-auto justify-center">
      <div className="text-xs uppercase tracking-widest text-accent mb-3">Quick check</div>
      <h2 className="text-2xl mb-6">{data.stem}</h2>
      <div className="grid gap-3">
        {data.options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = data.answer_index === i;
          const reveal = picked !== null;
          const tone = !reveal
            ? 'border-white/15 bg-white/5'
            : isCorrect
              ? 'border-emerald-400 bg-emerald-400/10'
              : isPicked
                ? 'border-red-400 bg-red-400/10'
                : 'border-white/10 bg-white/5 opacity-60';
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                onAnswer?.(i, i === data.answer_index);
              }}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${tone}`}
            >
              <span className="text-xs text-muted mr-2">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt-4 text-sm">
          <span className={correct ? 'text-emerald-400' : 'text-red-400'}>
            {correct ? 'Correct.' : 'Not quite.'}
          </span>{' '}
          <span className="text-white/80">{data.explanation}</span>
        </div>
      )}
    </div>
  );
}
