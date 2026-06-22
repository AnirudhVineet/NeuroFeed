import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { SocialChips } from '@/components/social/SocialChips';
import { RosterSkeleton } from '@/components/social/SocialStates';
import { friendlyError } from '@/lib/api';
import {
  acceptFriendRequest,
  challenge,
  declineFriendRequest,
  sendFriendRequest,
  useSocial,
  type ProfileLite,
} from '@/lib/social';

type Tab = 'friends' | 'requests' | 'challenges' | 'mutual';
const TABS: { id: Tab; label: string }[] = [
  { id: 'friends', label: 'Friends' },
  { id: 'requests', label: 'Requests' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'mutual', label: 'Mutual' },
];

export default function FriendsPage() {
  const social = useSocial();
  const [tab, setTab] = useState<Tab>('friends');

  const followingNames = new Set(social.following.map((u) => u.username));
  const mutual = social.friends.filter((f) => followingNames.has(f.username));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-24">
      <SocialChips />
      <header className="mb-4">
        <p className="text-[10px] uppercase tracking-widest text-white/55">Social</p>
        <h1 className="text-2xl font-bold text-white">Friends & challenges</h1>
        <p className="mt-1 text-sm text-white/65">
          Send friend requests, challenge people to quiz battles, see your match history.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t.label}
            {t.id === 'requests' && social.friend_requests.incoming.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500/80 px-1 text-[10px] font-bold">
                {social.friend_requests.incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="mt-4 space-y-2">
        {!social.ready && <RosterSkeleton count={4} />}

        {social.ready && tab === 'friends' && (
          social.friends.length ? (
            social.friends.map((f) => <FriendRow key={f.user_id} user={f} />)
          ) : (
            <Empty msg="No friends yet. Send a request from someone's profile or via Discover.">
              <Link to="/discover" className="mt-3 inline-block text-primary">Discover learners →</Link>
            </Empty>
          )
        )}

        {social.ready && tab === 'requests' && (
          <>
            <Section title="Incoming">
              {social.friend_requests.incoming.length ? (
                <ul className="space-y-1.5">
                  {social.friend_requests.incoming.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <Avatar seed={r.from?.avatar_seed || r.from?.username || 'x'} username={r.from?.username} size={36} />
                      <Link to={`/u/${r.from?.username}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                        @{r.from?.username ?? 'unknown'}
                      </Link>
                      <AcceptDeclineButtons id={r.id} />
                    </li>
                  ))}
                </ul>
              ) : <Empty msg="No incoming requests." />}
            </Section>
            <Section title="Sent">
              {social.friend_requests.outgoing.length ? (
                <ul className="space-y-1.5">
                  {social.friend_requests.outgoing.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <Avatar seed={r.to?.avatar_seed || r.to?.username || 'x'} username={r.to?.username} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm text-white/85">@{r.to?.username ?? 'unknown'}</span>
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-100">Pending</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty msg="No outgoing requests." />}
            </Section>
            <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-white/65">
              <p className="font-semibold text-white">Add a friend by username</p>
              <AddFriendForm />
            </div>
          </>
        )}

        {social.ready && tab === 'challenges' && (
          social.challenges.length ? (
            <ul className="space-y-1.5">
              {social.challenges.map((c) => (
                <li key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2">
                    <Avatar seed={c.to?.avatar_seed || c.to?.username || 'x'} username={c.to?.username} size={32} />
                    <p className="min-w-0 flex-1 truncate text-sm text-white">
                      <span className="font-semibold">@{c.to?.username ?? 'unknown'}</span>{' '}
                      <span className="text-white/55">· {c.mode} · {new Date(c.created_at).toLocaleString()}</span>
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      c.status === 'finished'
                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                        : c.status === 'declined'
                          ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                          : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  {c.status === 'finished' && c.wins_from != null && c.wins_to != null && (
                    <p className="mt-1 text-[11px] text-white/65">
                      Score: {c.wins_from} – {c.wins_to}
                    </p>
                  )}
                  {c.status !== 'finished' && (
                    <Link
                      to={`/challenge?user=${encodeURIComponent(c.to?.username ?? '')}&mode=${c.mode}${c.document_id ? `&doc=${c.document_id}` : ''}`}
                      className="mt-2 inline-block text-[11px] text-primary"
                    >
                      Play now →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : <Empty msg="No challenges yet. Send one from a profile or via Discover." />
        )}

        {social.ready && tab === 'mutual' && (
          mutual.length ? (
            mutual.map((f) => <FriendRow key={f.user_id} user={f} />)
          ) : <Empty msg="No mutual follows yet." />
        )}
      </main>
    </div>
  );
}

function AcceptDeclineButtons({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        onClick={async () => { setBusy(true); try { await acceptFriendRequest(id); } finally { setBusy(false); } }}
        disabled={busy}
        className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
      >
        Accept
      </button>
      <button
        onClick={async () => { setBusy(true); try { await declineFriendRequest(id); } finally { setBusy(false); } }}
        disabled={busy}
        className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/80 disabled:opacity-50"
      >
        Decline
      </button>
    </>
  );
}

function FriendRow({ user }: { user: ProfileLite }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <Avatar seed={user.avatar_seed || user.user_id} username={user.username} size={44} />
      <div className="min-w-0 flex-1">
        <Link to={`/u/${user.username}`} className="block text-sm font-semibold text-white hover:text-primary-soft">
          {user.display_name || user.username}
        </Link>
        <p className="truncate text-[11px] text-white/55">@{user.username}{user.college ? ` · ${user.college}` : ''}</p>
      </div>
      <button
        onClick={async () => {
          try {
            await challenge({ to: user.username, mode: 'random' });
            alert(`Challenge sent to @${user.username}`);
          } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
          }
        }}
        className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-white"
      >
        Challenge
      </button>
    </div>
  );
}

function AddFriendForm() {
  const [u, setU] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const cleaned = u.trim().toLowerCase().replace(/^@/, '');
        if (!cleaned) return;
        setBusy(true);
        setErr(null);
        try {
          await sendFriendRequest(cleaned);
          setU('');
        } catch (er) {
          setErr(friendlyError(er));
        } finally {
          setBusy(false);
        }
      }}
      className="mt-2 flex gap-2"
    >
      <input
        value={u}
        onChange={(e) => setU(e.target.value)}
        placeholder="@username"
        className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-3 py-2 text-xs font-semibold text-white shadow-glow disabled:opacity-50"
      >
        Send request
      </button>
      {err && <p className="basis-full text-[10px] text-rose-300">{err}</p>}
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-2">
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/55">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ msg, children }: { msg: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/55">
      {msg}
      {children}
    </div>
  );
}
