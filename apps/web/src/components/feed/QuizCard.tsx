import { useState } from 'react';
import type { QuizItem } from '../../../../../packages/shared-types/artifacts';

// Inline quiz card for the home feed. Once an option is picked, the choice
// is locked in (matches the existing scoring behaviour) and the explanation
// expands.
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
    <div className="rounded-xl border border-outline-variant bg-surface p-md">
      <div className="mb-sm text-label-sm uppercase tracking-widest text-primary">
        Quick check
      </div>
      <h2 className="mb-md text-headline-sm text-on-surface">{data.stem}</h2>
      <div className="grid gap-2">
        {data.options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = data.answer_index === i;
          const reveal = picked !== null;
          let tone =
            'border-outline-variant bg-surface-container-low hover:bg-surface-container';
          if (reveal && isCorrect) {
            tone = 'border-primary bg-primary-container/40 text-on-primary-container';
          } else if (reveal && isPicked && !isCorrect) {
            tone = 'border-error bg-error-container/40 text-on-error-container';
          } else if (reveal) {
            tone = 'border-outline-variant bg-surface-container-low opacity-60';
          }
          return (
            <button
              key={i}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                onAnswer?.(i, i === data.answer_index);
              }}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-body-md transition-colors disabled:cursor-default ${tone}`}
            >
              <span className="text-label-sm font-bold text-on-surface-variant">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt-md flex items-start gap-2 text-body-sm">
          <span
            className={`material-symbols-outlined ${correct ? 'text-primary' : 'text-error'}`}
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            {correct ? 'check_circle' : 'cancel'}
          </span>
          <div>
            <span className={`font-bold ${correct ? 'text-primary' : 'text-error'}`}>
              {correct ? 'Correct.' : 'Not quite.'}
            </span>{' '}
            <span className="text-on-surface-variant">{data.explanation}</span>
          </div>
        </div>
      )}
    </div>
  );
}
