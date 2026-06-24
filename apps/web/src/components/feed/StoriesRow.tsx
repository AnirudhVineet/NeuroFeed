import { Link } from 'react-router-dom';
import { inferSubject } from '@/lib/subjects';

// Horizontally scrolling "stories" strip at the top of the home feed.
// Each ring is one of the user's documents, labelled with its inferred
// subject. Tapping opens the document's chapter hub.
//
// Mirrors the mockup design: gradient ring border for active/unviewed,
// dim grayscale ring for "viewed" (we don't track viewed state yet — all
// rings render active for now).

export interface StoryDoc {
  id: string;
  title: string;
}

export function StoriesRow({ docs }: { docs: StoryDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <section className="mb-md">
      <div className="no-scrollbar flex gap-md overflow-x-auto px-md pb-2">
        {docs.map((d) => {
          const subj = inferSubject(d.title);
          const hue = hashHue(d.title);
          return (
            <Link
              key={d.id}
              to={`/doc/${d.id}`}
              className="flex shrink-0 cursor-pointer flex-col items-center gap-xs"
              title={d.title}
            >
              <div
                className="rounded-full p-[3px]"
                style={{
                  background: `conic-gradient(from 200deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 70% 50%), hsl(${(hue + 200) % 360} 70% 50%), hsl(${hue} 70% 45%))`,
                }}
              >
                <div className="rounded-full bg-surface p-0.5">
                  <div
                    className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-surface text-on-primary"
                    style={{
                      background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 80) % 360} 65% 50%))`,
                    }}
                  >
                    <span className="text-label-sm font-bold">{initials(d.title)}</span>
                  </div>
                </div>
              </div>
              <span className="block max-w-[64px] truncate text-label-sm">{subj}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function initials(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
