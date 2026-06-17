import type { SwipeCard as SwipeCardData } from '../../../../../packages/shared-types/artifacts';

export function SwipeCard({ data, override }: { data: SwipeCardData; override?: { title: string; body: string } | null }) {
  const title = override?.title ?? data.title;
  const body = override?.body ?? data.body;
  return (
    <div
      className="h-full w-full flex flex-col justify-center items-center text-center p-8"
      style={{ background: `linear-gradient(160deg, ${data.accent_color}33, #0b0f1a)` }}
    >
      <div className="text-6xl mb-6">{data.icon}</div>
      <h2 className="text-3xl font-bold mb-4 max-w-md">{title}</h2>
      <p className="text-lg text-white/90 max-w-md">{body}</p>
      {override && (
        <span className="mt-4 text-xs uppercase tracking-wider text-accent">simpler</span>
      )}
    </div>
  );
}
