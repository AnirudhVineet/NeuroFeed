export default function FeedPage() {
  const placeholders = ['Reels', 'Swipe cards', 'Flashcards', 'Quiz'];
  return (
    <div className="feed">
      {placeholders.map((p, i) => (
        <section
          key={i}
          className="flex items-center justify-center text-3xl font-semibold"
          style={{ background: `hsl(${(i * 70) % 360} 35% 12%)` }}
        >
          {p}
        </section>
      ))}
    </div>
  );
}
