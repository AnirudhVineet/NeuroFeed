import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { ReelCard } from '@/components/feed/ReelCard';
import { supabase } from '@/lib/supabase';
import { useSocial } from '@/lib/social';
import {
  listConversations,
  listMessages,
  markConversationRead,
  openConversation,
  sendTextMessage,
  subscribeToConversation,
  type ConversationSummary,
  type Message,
} from '@/lib/messages';
import type { ReelScript } from '../../../../packages/shared-types/artifacts';

// Two-pane Messages page:
//   - Left: conversation list (always shown on md+; on mobile, hides when a
//           conversation is open via ?with=<peer> or ?conv=<id>).
//   - Right: active chat. Empty state when nothing selected.
//
// Deep-linking: ?with=<peer_user_id> opens (or creates) a conversation with
// that user; ?conv=<id> opens a known conversation. ShareReelSheet uses the
// former to drop the user straight into the chat with their selection done.

export default function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const friends = useSocial().friends;

  // Bootstrap auth + conversation list.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try {
        const res = await listConversations(uid);
        setConvs(res.items);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setConvsLoading(false);
      }
    })();
  }, []);

  // Resolve ?with=<peer> by upserting the conversation, then swapping to ?conv.
  useEffect(() => {
    const withId = params.get('with');
    const convFromUrl = params.get('conv');
    if (convFromUrl && convFromUrl !== activeConvId) {
      setActiveConvId(convFromUrl);
      return;
    }
    if (!withId || !userId) return;
    if (withId === userId) {
      setParams({}, { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { id } = await openConversation(userId, withId);
        if (cancelled) return;
        const next = new URLSearchParams(params);
        next.delete('with');
        next.set('conv', id);
        setParams(next, { replace: true });
        setActiveConvId(id);
        // Refresh the conv list so the new chat appears in the sidebar.
        const refreshed = await listConversations(userId);
        if (!cancelled) setConvs(refreshed.items);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [params, userId, activeConvId, setParams]);

  const activeConv = useMemo(
    () => convs.find((c) => c.id === activeConvId) ?? null,
    [convs, activeConvId],
  );

  function selectConv(c: ConversationSummary) {
    setActiveConvId(c.id);
    const next = new URLSearchParams(params);
    next.delete('with');
    next.set('conv', c.id);
    setParams(next, { replace: true });
  }

  function backToList() {
    setActiveConvId(null);
    const next = new URLSearchParams(params);
    next.delete('conv');
    setParams(next, { replace: true });
  }

  // After sending or receiving a message in the active conv, bubble the new
  // last_message_at + reset unread count locally so the sidebar reflects it
  // without a refetch.
  const onLocalActivity = useCallback((msg: Message) => {
    setConvs((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((c) => c.id === msg.conversation_id);
      if (idx === -1) return prev;
      const updated: ConversationSummary = {
        ...next[idx],
        last_message: msg,
        last_message_at: msg.created_at,
        unread_count: msg.sender_id === userId ? 0 : next[idx].unread_count,
      };
      next.splice(idx, 1);
      next.unshift(updated);
      return next;
    });
  }, [userId]);

  // Clear active conv's unread badge on open.
  useEffect(() => {
    if (!activeConvId || !userId) return;
    setConvs((prev) =>
      prev.map((c) => (c.id === activeConvId ? { ...c, unread_count: 0 } : c)),
    );
  }, [activeConvId, userId]);

  if (err) {
    return <CenteredEmpty title="Could not load messages" sub={err} />;
  }
  if (!userId) {
    return <CenteredEmpty title="Sign in to use Messages" />;
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-5xl gap-0 overflow-hidden md:py-4">
      {/* Conversation list */}
      <aside
        className={`flex w-full flex-col border-outline-variant bg-surface-container-lowest md:w-80 md:border md:rounded-2xl ${
          activeConvId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <header className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <h1 className="text-base font-semibold text-on-surface">Messages</h1>
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">
            {convs.length} chat{convs.length === 1 ? '' : 's'}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <p className="px-4 py-6 text-xs text-on-surface-variant">Loading…</p>
          ) : convs.length === 0 ? (
            <EmptyConvList friendsCount={friends.length} />
          ) : (
            <ul>
              {convs.map((c) => (
                <li key={c.id}>
                  <ConversationRow
                    conv={c}
                    active={c.id === activeConvId}
                    onClick={() => selectConv(c)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat pane */}
      <section
        className={`flex flex-1 flex-col border-outline-variant bg-surface-container-lowest md:ml-4 md:rounded-2xl md:border ${
          activeConvId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeConvId && activeConv ? (
          <ChatPane
            convId={activeConvId}
            userId={userId}
            peer={activeConv.peer}
            onBack={backToList}
            onActivity={onLocalActivity}
          />
        ) : (
          <CenteredEmpty
            title="Pick a conversation"
            sub="Or share a reel from the feed to start one."
          />
        )}
      </section>
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: ConversationSummary;
  active: boolean;
  onClick: () => void;
}) {
  const preview = conv.last_message
    ? conv.last_message.kind === 'text'
      ? conv.last_message.body ?? ''
      : '📎 Shared a reel'
    : 'No messages yet — say hi 👋';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-outline-variant px-4 py-3 text-left transition-colors hover:bg-surface-container ${
        active ? 'bg-surface-container' : ''
      }`}
    >
      <Avatar
        seed={conv.peer.avatar_seed}
        size={40}
        username={conv.peer.username}
        label={conv.peer.display_name}
        linkTo={false}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-on-surface">
            {conv.peer.display_name}
          </p>
          <span className="shrink-0 text-[10px] text-on-surface-variant tabular-nums">
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        <p className="truncate text-xs text-on-surface-variant">{preview}</p>
      </div>
      {conv.unread_count > 0 && (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-on-primary">
          {conv.unread_count}
        </span>
      )}
    </button>
  );
}

function ChatPane({
  convId,
  userId,
  peer,
  onBack,
  onActivity,
}: {
  convId: string;
  userId: string;
  peer: ConversationSummary['peer'];
  onBack: () => void;
  onActivity: (m: Message) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load initial page + subscribe to realtime inserts.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    void (async () => {
      try {
        const res = await listMessages(convId, userId, { limit: 100 });
        if (cancelled) return;
        setMessages(res.items);
        await markConversationRead(convId, userId).catch(() => {});
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [convId, userId]);

  useEffect(() => {
    const unsubscribe = subscribeToConversation(convId, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row];
      });
      onActivity(row);
      // If a peer message arrives while the chat is open, mark it read.
      if (row.sender_id !== userId) {
        void markConversationRead(convId, userId).catch(() => {});
      }
      // Realtime payloads come from raw row INSERTs — they don't include the
      // server-side join that hydrates `artifact`. For reel shares, refetch
      // so the embedded ReelCard has its payload + document title.
      if (row.kind === 'reel_share' && !row.artifact) {
        void listMessages(convId, userId, { limit: 100 })
          .then((res) => setMessages(res.items))
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, [convId, userId, onActivity]);

  // Scroll to the bottom whenever the message list grows.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = await sendTextMessage(convId, userId, body);
      // Optimistic-style append (realtime would also deliver, but the dedupe
      // in subscribeToConversation prevents doubles).
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      onActivity(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container md:hidden"
          aria-label="Back to conversations"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            arrow_back
          </span>
        </button>
        <Avatar
          seed={peer.avatar_seed}
          size={36}
          username={peer.username}
          label={peer.display_name}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-on-surface">
            {peer.display_name}
          </p>
          <Link
            to={`/u/${peer.username}`}
            className="truncate text-[11px] text-on-surface-variant hover:text-primary"
          >
            @{peer.username}
          </Link>
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-center text-xs text-on-surface-variant">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="mt-10 text-center text-xs text-on-surface-variant">
            No messages yet. Say hi 👋
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m, i) => {
              const showAvatar =
                m.sender_id !== userId &&
                (i === 0 || messages[i - 1].sender_id !== m.sender_id);
              return (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  isMine={m.sender_id === userId}
                  userId={userId}
                  peer={peer}
                  showAvatar={showAvatar}
                />
              );
            })}
          </ul>
        )}
        {err && (
          <p className="mt-2 text-center text-[11px] text-error">{err}</p>
        )}
      </div>

      <footer className="border-t border-outline-variant bg-surface-container px-3 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Message @${peer.username}…`}
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-glow transition-transform hover:scale-105 disabled:opacity-40"
            aria-label="Send"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {sending ? 'progress_activity' : 'send'}
            </span>
          </button>
        </form>
      </footer>
    </>
  );
}

function MessageBubble({
  msg,
  isMine,
  userId,
  peer,
  showAvatar,
}: {
  msg: Message;
  isMine: boolean;
  userId: string;
  peer: ConversationSummary['peer'];
  showAvatar: boolean;
}) {
  const isReel = msg.kind === 'reel_share';
  // Text bubbles get colored to indicate sender; reel-share embeds keep their
  // own framing (the reel player is dark and looks weird inside a tinted
  // bubble), so we drop the tint + padding for those.
  const bubbleCls = isReel
    ? 'w-[280px] max-w-full sm:w-[320px]'
    : `rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm break-words ${
        isMine ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'
      }`;
  // Layout: the <li> is a full-width row that handles horizontal alignment
  // via justify-{start|end}. The inner column is capped at 75% of the <li> —
  // a percentage of a definite width (the <li>'s 100%), which avoids the
  // "max-w-% of an inline-shrinking parent" trap that was collapsing the
  // sender's bubble to a single-character column.
  return (
    <li className={`flex w-full items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isMine && (
        <div className="w-7 shrink-0">
          {showAvatar && (
            <Avatar
              seed={peer.avatar_seed}
              size={28}
              username={peer.username}
              label={peer.display_name}
              linkTo={false}
            />
          )}
        </div>
      )}
      <div className={`flex max-w-[75%] min-w-0 flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
        <div className={bubbleCls}>
          {msg.kind === 'text' ? (
            <span className="whitespace-pre-wrap break-words">{msg.body}</span>
          ) : (
            <ReelShareBlock msg={msg} userId={userId} />
          )}
        </div>
        <span className="px-1 text-[10px] text-on-surface-variant tabular-nums">
          {formatTime(msg.created_at)}
        </span>
      </div>
    </li>
  );
}

function ReelShareBlock({ msg, userId }: { msg: Message; userId: string }) {
  const art = msg.artifact;
  if (!art) {
    return (
      <div className="rounded-2xl border border-outline-variant bg-surface-container-high px-3 py-2 text-sm italic text-on-surface-variant">
        Shared a reel (unavailable)
      </div>
    );
  }
  const reel = art.payload as ReelScript;
  const docTitle = art.document_title ?? '';
  // Inline reel player. ReelCard already wires up its own IntersectionObserver
  // for auto-play and Audio for narration — we just give it a container.
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
      {docTitle && (
        <div className="flex items-center gap-1 border-b border-outline-variant bg-surface-container px-3 py-1.5 text-[10px] uppercase tracking-widest text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }} aria-hidden>
            movie
          </span>
          <span className="truncate">{docTitle}</span>
        </div>
      )}
      <div
        className="relative aspect-[4/5] w-full overflow-hidden bg-black"
        style={{ contain: 'paint' }}
      >
        <ReelCard
          data={reel}
          documentId={art.document_id}
          artifactId={art.id}
          userId={userId}
          embedded
        />
      </div>
    </div>
  );
}

function EmptyConvList({ friendsCount }: { friendsCount: number }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
        <span className="material-symbols-outlined text-on-surface-variant">forum</span>
      </div>
      <p className="text-sm font-semibold text-on-surface">No conversations yet</p>
      {friendsCount === 0 ? (
        <p className="mt-1 text-[11px] text-on-surface-variant">
          Add some friends first — then share a reel or open a chat from their profile.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-on-surface-variant">
          Share a reel from the feed, or visit a friend's profile to start chatting.
        </p>
      )}
      <Link
        to="/friends"
        className="mt-3 inline-flex rounded-full bg-primary-container px-4 py-1.5 text-xs font-semibold text-on-primary-container hover:brightness-95"
      >
        Find friends
      </Link>
    </div>
  );
}

function CenteredEmpty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '28px' }}>
          forum
        </span>
      </div>
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      {sub && <p className="mt-1 text-[11px] text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
