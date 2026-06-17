import { useEffect, useMemo, useState } from 'react';
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

  if (!userId) return <EmptyState message="Sign in to see your feed." />;
  if (error) return <EmptyState message={error} />;
  if (!items.length) return <EmptyState message="Upload a document to seed your feed." />;

  return (
    <div className="feed">
      {merged.map((it) => (
        <section key={`${it.id}-${it.created_at}`} className="relative">
          <CardBody item={it} override={overrides[it.id] ?? null} userId={userId} />
          <CardActions
            onLike={() => userId && postEvent(userId, 'like', { artifact_id: it.id })}
            onSave={() => userId && postEvent(userId, 'save', { artifact_id: it.id })}
            onShare={() => navigator.share?.({ title: 'NeuroFeed', text: 'Check this out' })}
            onExplainSimpler={async () => {
              const r = await explainSimpler(it.id, userId);
              setOverrides((m) => ({ ...m, [it.id]: r }));
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
  switch (item.type) {
    case 'swipe_card':
      return <SwipeCard data={item.payload as SwipeCardData} override={override} />;
    case 'flashcard':
      return <FlashcardCard data={item.payload as Flashcard} />;
    case 'quiz':
      return (
        <QuizCard
          data={item.payload as QuizItem}
          onAnswer={(chosen, correct) =>
            postEvent(userId, 'quiz_answer', {
              artifact_id: item.id, chosen, correct,
            })
          }
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-dvh flex items-center justify-center p-8 text-center text-muted">
      {message}
    </div>
  );
}
