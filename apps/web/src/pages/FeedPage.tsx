import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardActions } from '@/components/feed/CardActions';
import { FlashcardCard } from '@/components/feed/FlashcardCard';
import { QuizCard } from '@/components/feed/QuizCard';
import { ReelCard } from '@/components/feed/ReelCard';
import { SwipeCard } from '@/components/feed/SwipeCard';
import {
  explainSimpler,
  fetchFeed,
  postEvent,
  quizByConcept,
  type FeedItem,
} from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import { useGamify } from '@/state/gamify';
import type {
  Flashcard,
  QuizItem,
  ReelScript,
  SwipeCard as SwipeCardData,
} from '../../../../packages/shared-types/artifacts';

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { title: string; body: string } | null>>({});
  const [injected, setInjected] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refreshGamify = useGamify((s) => s.refreshAfter);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try {
        const res = await fetchFeed(uid);
        setItems(res.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const merged = useMemo(() => [...items, ...injected], [items, injected]);

  if (!userId)
    return <EmptyState message="Sign in to see your feed." cta={<Link to="/auth" className="text-accent underline">Sign in</Link>} />;
  if (error) return <EmptyState message={error} />;
  if (!items.length)
    return (
      <EmptyState
        message="Your feed is empty."
        sub="Upload a document to generate your first cards, quizzes, and reels."
        cta={
          <Link
            to="/upload"
            className="inline-block mt-2 px-4 py-2 rounded-full bg-accent text-white"
          >
            Upload now
          </Link>
        }
      />
    );

  return (
    <div className="feed">
      {merged.map((it) => (
        <section key={`${it.id}-${it.created_at}`} className="relative">
          <CardBody item={it} override={overrides[it.id] ?? null} userId={userId} />
          <CardActions
            onLike={() => {
              if (!userId) return;
              void postEvent(userId, 'like', { artifact_id: it.id });
              refreshGamify(userId);
            }}
            onSave={() => {
              if (!userId) return;
              void postEvent(userId, 'save', { artifact_id: it.id });
              refreshGamify(userId);
            }}
            onShare={() => navigator.share?.({ title: 'NeuroFeed', text: 'Check this out' })}
            onExplainSimpler={async () => {
              const r = await explainSimpler(it.id, userId);
              setOverrides((m) => ({ ...m, [it.id]: r }));
              refreshGamify(userId);
            }}
            onQuizMe={
              it.concept_id
                ? async () => {
                    const r = await quizByConcept(it.concept_id!);
                    const newItems: FeedItem[] = r.items.map((q) => ({
                      id: `inj-${q.id}`,
                      document_id: it.document_id,
                      concept_id: it.concept_id,
                      type: 'quiz',
                      payload: q.payload,
                      score: 0,
                      reason: { injected: 1 },
                      created_at: new Date().toISOString(),
                    }));
                    setInjected((m) => [...m, ...newItems]);
                  }
                : undefined
            }
          />
        </section>
      ))}
    </div>
  );
}

function CardBody({
  item,
  override,
  userId,
}: {
  item: FeedItem;
  override: { title: string; body: string } | null;
  userId: string;
}) {
  const refreshGamify = useGamify((s) => s.refreshAfter);
  switch (item.type) {
    case 'swipe_card':
      return <SwipeCard data={item.payload as SwipeCardData} override={override} />;
    case 'flashcard':
      return <FlashcardCard data={item.payload as Flashcard} />;
    case 'quiz':
      return (
        <QuizCard
          data={item.payload as QuizItem}
          onAnswer={(chosen, correct) => {
            void postEvent(userId, 'quiz_answer', {
              artifact_id: item.id, chosen, correct,
            });
            refreshGamify(userId);
          }}
        />
      );
    case 'reel_script':
      return <ReelCard data={item.payload as ReelScript} />;
    default:
      return (
        <div className="h-full flex items-center justify-center text-muted">
          {item.type} (no renderer yet)
        </div>
      );
  }
}

function EmptyState({ message, sub, cta }: { message: string; sub?: string; cta?: React.ReactNode }) {
  return (
    <div className="h-dvh flex flex-col items-center justify-center p-8 text-center">
      <p className="text-lg">{message}</p>
      {sub && <p className="text-muted mt-1 text-sm max-w-sm">{sub}</p>}
      {cta}
    </div>
  );
}
