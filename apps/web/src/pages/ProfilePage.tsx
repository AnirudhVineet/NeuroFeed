import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { ErrorState } from '@/components/social/SocialStates';
import { fetchAnalytics, type AnalyticsPayload } from '@/lib/analytics';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { inferSubject, type Subject } from '@/lib/subjects';
import { BADGE_CATALOG } from '@/lib/roster';
import { friendlyError } from '@/lib/api';
import {
  bootstrap as bootstrapSocial,
  challenge,
  fetchFollowers,
  fetchProfileByUsername,
  isFollowing,
  isFriend,
  patchProfile,
  sendFriendRequest,
  toggleFollow,
  useSocial,
  type ProfileLite,
  type ProfileMeta,
} from '@/lib/social';
import { supabase } from '@/lib/supabase';

type TabId =
  | 'overview'
  | 'uploads'
  | 'paths'
  | 'achievements'
  | 'bookmarks'
  | 'activity'
  | 'stats'
  | 'following'
  | 'followers'
  | 'notes'
  | 'reels'
  | 'stories'
  | 'quiz'
  | 'leaderboard';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'overview', label: 'Overview', glyph: '✦' },
  { id: 'uploads', label: 'Uploads', glyph: '📤' },
  { id: 'paths', label: 'Paths', glyph: '🗺' },
  { id: 'achievements', label: 'Achievements', glyph: '🏅' },
  { id: 'bookmarks', label: 'Bookmarks', glyph: '🔖' },
  { id: 'activity', label: 'Activity', glyph: '⏱' },
  { id: 'stats', label: 'Stats', glyph: '📊' },
  { id: 'following', label: 'Following', glyph: '➤' },
  { id: 'followers', label: 'Followers', glyph: '★' },
  { id: 'notes', label: 'Public notes', glyph: '✎' },
  { id: 'reels', label: 'Public reels', glyph: '🎬' },
  { id: 'stories', label: 'Stories', glyph: '📖' },
  { id: 'quiz', label: 'Quiz records', glyph: '⚔' },
  { id: 'leaderboard', label: 'Leaderboard', glyph: '🏆' },
];

interface SelfData {
  userId: string;
  email: string | null;
  createdAt: string | null;
  docs: (DocSummary & { subject: Subject })[];
  analytics: AnalyticsPayload | null;
}

export default function ProfilePage() {
  const params = useParams<{ username?: string }>();
  const social = useSocial();
  const isSelf = !params.username || params.username === 'me' || params.username === social.profile?.username;
  const [tab, setTab] = useState<TabId>('overview');

  const [self, setSelf] = useState<SelfData | null>(null);
  const [other, setOther] = useState<ProfileMeta | null>(null);
  const [otherDocs, setOtherDocs] = useState<DocSummary[]>([]);
  const [otherFollowers, setOtherFollowers] = useState<ProfileLite[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [selfErr, setSelfErr] = useState<string | null>(null);
  const [otherErr, setOtherErr] = useState<string | null>(null);

  const loadSelf = useCallback(async () => {
    setSelfErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const uid = session?.user.id;
      const email = session?.user.email ?? null;
      setSignedIn(Boolean(uid));
      setAuthReady(true);
      if (!uid) return;
      // Best-effort hydrate (no-op if already done).
      void bootstrapSocial(uid);
      const [d, a] = await Promise.all([
        fetchDocuments(uid).then((r) => r.items).catch(() => [] as DocSummary[]),
        fetchAnalytics(uid).catch(() => null),
      ]);
      const enriched = d.map((doc) => ({ ...doc, subject: inferSubject(doc.title) }));
      setSelf({ userId: uid, email, createdAt: session?.user.created_at ?? null, docs: enriched, analytics: a });
    } catch (e) {
      setAuthReady(true);
      setSelfErr(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    if (!isSelf) return;
    void loadSelf();
  }, [isSelf, loadSelf]);

  const loadOther = useCallback(async () => {
    if (!params.username) return;
    setOtherErr(null);
    try {
      const p = await fetchProfileByUsername(params.username);
      setOther(p);
      if (p) {
        const f = await fetchFollowers(p.username).catch(() => []);
        setOtherFollowers(f);
        const docs = await fetch(
          `${(import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000'}/api/documents?user_id=${encodeURIComponent(p.user_id)}`,
        )
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .catch(() => ({ items: [] }));
        setOtherDocs(docs.items ?? []);
      }
    } catch (e) {
      setOtherErr(friendlyError(e));
    }
  }, [params.username]);

  useEffect(() => {
    if (isSelf) return;
    void loadOther();
  }, [isSelf, loadOther]);

  const view = useMemo(
    () => buildView({ isSelf, social, self, other, otherDocs, otherFollowers }),
    [isSelf, social, self, other, otherDocs, otherFollowers],
  );

  // -------- Loading / error / signed-out states --------
  if (isSelf && authReady && signedIn === false) {
    return (
      <div className="mx-auto max-w-md px-6 pb-32 pt-32 text-center">
        <p className="text-base font-semibold text-white">You're signed out.</p>
        <p className="mt-1 text-sm text-white/65">Sign in to view your profile.</p>
        <Link
          to="/auth"
          className="mt-4 inline-block rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-5 py-2 text-xs font-semibold text-white shadow-glow"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (isSelf && selfErr) {
    return (
      <div className="mx-auto max-w-md px-4 pb-32 pt-32">
        <ErrorState
          title="Couldn't load your profile"
          message={selfErr}
          onRetry={() => void loadSelf()}
        />
      </div>
    );
  }

  if (!isSelf && otherErr) {
    return (
      <div className="mx-auto max-w-md px-4 pb-32 pt-32">
        <ErrorState
          title="Couldn't load this profile"
          message={otherErr}
          onRetry={() => void loadOther()}
        />
      </div>
    );
  }

  if (!view) {
    // Self path is still loading the session/docs/analytics OR social bootstrap.
    if (isSelf && (!authReady || !social.ready || !self)) {
      return <ProfileLoadingSkeleton />;
    }
    // Self loaded but social bootstrap returned a null profile (rare — likely
    // bootstrap fetched while the backend was 500ing). Re-bootstrap and show a
    // gentle prompt.
    if (isSelf && self && !social.profile) {
      return (
        <div className="mx-auto max-w-md px-4 pb-32 pt-32">
          <ErrorState
            title="Profile not synced yet"
            message="We couldn't load your profile data. Try again."
            onRetry={() => {
              void bootstrapSocial(self.userId);
              void loadSelf();
            }}
          />
        </div>
      );
    }
    return (
      <div className="px-8 pb-32 pt-32 text-center text-sm text-white/55">
        No profile found for @{params.username}.
        <div className="mt-3">
          <Link to="/discover" className="text-primary">Discover learners →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-32 pt-24">
      <Header view={view} isSelf={isSelf} />
      <TabBar tab={tab} onTab={setTab} />
      <main className="mt-5 space-y-5">
        {tab === 'overview' && <OverviewTab view={view} onTab={setTab} />}
        {tab === 'uploads' && <UploadsTab view={view} />}
        {tab === 'paths' && <PathsTab view={view} />}
        {tab === 'achievements' && <AchievementsTab view={view} />}
        {tab === 'bookmarks' && <BookmarksTab view={view} />}
        {tab === 'activity' && <ActivityTab view={view} />}
        {tab === 'stats' && <StatsTab view={view} />}
        {tab === 'following' && <FollowingTab view={view} />}
        {tab === 'followers' && <FollowersTab view={view} />}
        {tab === 'notes' && <NotesTab view={view} />}
        {tab === 'reels' && <ReelsTab view={view} />}
        {tab === 'stories' && <StoriesTab view={view} />}
        {tab === 'quiz' && <QuizTab view={view} />}
        {tab === 'leaderboard' && <LeaderboardTab view={view} />}
      </main>
    </div>
  );
}

// ---- View model ----

interface ProfileView {
  username: string;
  display_name: string;
  bio: string;
  college: string;
  subjects: Subject[];
  avatar_seed: string;
  level: number;
  xp: number;
  streak: number;
  longest_streak: number;
  followers: number;
  following: number;
  badges: string[];
  joined: string | null;
  isSelfView: boolean;
  stats: {
    uploads: number;
    reels_watched: number;
    stories_completed: number;
    quizzes_finished: number;
    flashcards_reviewed: number;
    hours: number;
    accuracy: number;
    favorite_subject: Subject | null;
    wins: number;
    losses: number;
  };
  docs: (DocSummary & { subject: Subject })[];
  followingList: ProfileLite[];
  followersList: ProfileLite[];
  badgesFromAchievements: string[];
}

function buildView(args: {
  isSelf: boolean;
  social: ReturnType<typeof useSocial>;
  self: SelfData | null;
  other: ProfileMeta | null;
  otherDocs: DocSummary[];
  otherFollowers: ProfileLite[];
}): ProfileView | null {
  const { isSelf, social, self, other, otherDocs, otherFollowers } = args;

  if (isSelf) {
    if (!social.profile || !self) return null;
    const xp = social.profile.xp;
    const streak = social.profile.streak;
    const quizCorrect = self.analytics?.mastery.reduce((acc, m) => acc + m.score, 0) ?? 0;
    const conceptCount = self.analytics?.mastery.length ?? 0;
    const accuracy = conceptCount ? Math.round((quizCorrect / conceptCount) * 100) : 0;
    const favorite = subjectCounts(self.docs)[0]?.subject ?? null;
    const wins = social.challenges.filter((c) => c.status === 'finished' && winnerIsSelf(c, social.user_id)).length;
    const losses = social.challenges.filter((c) => c.status === 'finished' && loserIsSelf(c, social.user_id)).length;
    return {
      username: social.profile.username,
      display_name: social.profile.display_name || social.profile.username,
      bio: social.profile.bio,
      college: social.profile.college,
      subjects: (social.profile.subjects.length ? social.profile.subjects : [...new Set(self.docs.map((d) => d.subject))].slice(0, 6)) as Subject[],
      avatar_seed: social.profile.avatar_seed || self.userId,
      level: Math.max(1, Math.floor(xp / 250)),
      xp,
      streak,
      longest_streak: streak,
      followers: social.profile.followers_count,
      following: social.profile.following_count,
      badges: deriveBadges({ xp, streak, docs: self.docs.length, accuracy, achievements: social.profile.achievements }),
      joined: self.createdAt,
      isSelfView: true,
      stats: {
        uploads: self.docs.length,
        reels_watched: countEvent(self),
        stories_completed: 0,
        quizzes_finished: countEvent(self),
        flashcards_reviewed: countEvent(self),
        hours: Math.round((self.analytics?.activity_series.reduce((a, p) => a + p.events, 0) ?? 0) / 8),
        accuracy,
        favorite_subject: favorite,
        wins,
        losses,
      },
      docs: self.docs,
      followingList: social.following,
      followersList: [], // populated lazily in FollowersTab via fetch on demand
      badgesFromAchievements: social.profile.achievements,
    };
  }

  if (!other) return null;
  const enrichedOther = otherDocs.map((d) => ({ ...d, subject: inferSubject(d.title) }));
  return {
    username: other.username,
    display_name: other.display_name || other.username,
    bio: other.bio || '',
    college: other.college || '',
    subjects: (other.subjects ?? []) as Subject[],
    avatar_seed: other.avatar_seed || other.user_id,
    level: Math.max(1, Math.floor(other.xp / 250)),
    xp: other.xp,
    streak: other.streak,
    longest_streak: other.streak,
    followers: other.followers_count,
    following: other.following_count,
    badges: deriveBadges({ xp: other.xp, streak: other.streak, docs: other.uploads_count, accuracy: 0, achievements: other.achievements }),
    joined: null,
    isSelfView: false,
    stats: {
      uploads: other.uploads_count,
      reels_watched: 0,
      stories_completed: 0,
      quizzes_finished: 0,
      flashcards_reviewed: 0,
      hours: 0,
      accuracy: 0,
      favorite_subject: ((other.subjects ?? [])[0] as Subject) ?? null,
      wins: 0,
      losses: 0,
    },
    docs: enrichedOther,
    followingList: [],
    followersList: otherFollowers,
    badgesFromAchievements: other.achievements,
  };
}

function winnerIsSelf(c: { from_user: string; to_user: string; wins_from?: number | null; wins_to?: number | null }, selfId: string | null): boolean {
  if (!selfId || c.wins_from == null || c.wins_to == null) return false;
  return selfId === c.from_user ? c.wins_from > c.wins_to : c.wins_to > c.wins_from;
}
function loserIsSelf(c: { from_user: string; to_user: string; wins_from?: number | null; wins_to?: number | null }, selfId: string | null): boolean {
  if (!selfId || c.wins_from == null || c.wins_to == null) return false;
  return selfId === c.from_user ? c.wins_from < c.wins_to : c.wins_to < c.wins_from;
}

function countEvent(self: SelfData): number {
  // Until raw event counts are exposed, approximate via active days * a small
  // multiplier so the surface doesn't show zeros for users who clearly do use
  // the app. Swap for real counts once /api/analytics returns them.
  const days = self.analytics?.activity_series.filter((p) => p.events > 0).length ?? 0;
  return days * 3;
}

function deriveBadges(args: { xp: number; streak: number; docs: number; accuracy: number; achievements: string[] }): string[] {
  const out = new Set<string>();
  if (args.streak >= 30) out.add('30_day_streak');
  if (args.xp >= 2500) out.add('quiz_master');
  if (args.docs >= 10) out.add('10_uploads');
  if (args.accuracy >= 95) out.add('perfect_quiz');
  for (const a of args.achievements) {
    if (a === 'first_upload') out.add('early_adopter');
    if (a === 'quiz_25') out.add('quiz_master');
    if (a === 'binge_3') out.add('100_reels');
  }
  out.add('early_adopter');
  return Array.from(out);
}

function subjectCounts(docs: { subject: Subject }[]): { subject: Subject; count: number }[] {
  const map = new Map<Subject, number>();
  for (const d of docs) map.set(d.subject, (map.get(d.subject) ?? 0) + 1);
  return Array.from(map.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Header / tabs ----

function Header({ view, isSelf }: { view: ProfileView; isSelf: boolean }) {
  const following = isFollowing(view.username);
  const friend = isFriend(view.username);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSignOut() {
    if (!window.confirm('Sign out of NeuroFeed?')) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningOut(false);
    }
  }

  async function onFollow() {
    setBusy(true);
    setErr(null);
    try { await toggleFollow(view.username); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function onFriend() {
    setBusy(true);
    setErr(null);
    try { await sendFriendRequest(view.username); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function onChallenge() {
    setBusy(true);
    setErr(null);
    try {
      await challenge({ to: view.username, mode: '1v1' });
      alert(`Challenge sent to @${view.username}!`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-card/60 via-card/40 to-card/30 p-5 shadow-soft backdrop-blur">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-gradient opacity-25 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-5">
        <Avatar
          seed={view.avatar_seed}
          username={view.username}
          size={88}
          linkTo={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-white">{view.display_name}</h1>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/65">
              @{view.username}
            </span>
            <span className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-glow">
              L{view.level}
            </span>
          </div>
          <p className="mt-1 max-w-prose text-sm text-white/75">{view.bio || 'No bio yet.'}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {view.subjects.slice(0, 6).map((s) => (
              <span key={s} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/75">{s}</span>
            ))}
            {view.college && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-200">{view.college}</span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/75 sm:grid-cols-4">
            <Stat label="XP" value={view.xp.toLocaleString()} />
            <Stat label="Streak" value={`${view.streak}d 🔥`} />
            <Stat label="Followers" value={view.followers.toLocaleString()} />
            <Stat label="Following" value={view.following.toLocaleString()} />
          </dl>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          {isSelf ? (
            <>
              <button
                onClick={() => setEditing((v) => !v)}
                className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                {editing ? 'Done' : 'Edit profile'}
              </button>
              <Link to="/settings/privacy" className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/10">
                Privacy
              </Link>
              <button
                onClick={onSignOut}
                disabled={signingOut}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onFollow}
                disabled={busy}
                className={`rounded-full px-4 py-2 text-xs font-semibold shadow-glow disabled:opacity-50 ${
                  following
                    ? 'border border-white/15 bg-white/[0.06] text-white'
                    : 'bg-gradient-to-br from-primary via-secondary to-accent text-white'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
              {friend ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200">
                  Friends ✓
                </span>
              ) : (
                <button onClick={onFriend} disabled={busy} className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50">
                  Add friend
                </button>
              )}
              <button onClick={onChallenge} disabled={busy} className="rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-white hover:bg-accent/25 disabled:opacity-50">
                Challenge to quiz
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/u/${view.username}`);
                  alert('Profile link copied');
                }}
                className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs text-white/75 hover:bg-white/10"
              >
                Share profile
              </button>
            </>
          )}
          {err && <p className="text-[10px] text-rose-300">{err}</p>}
        </div>
      </div>
      {isSelf && editing && <EditProfileForm />}
    </header>
  );
}

function EditProfileForm() {
  const social = useSocial();
  const [display, setDisplay] = useState(social.profile?.display_name ?? '');
  const [bio, setBio] = useState(social.profile?.bio ?? '');
  const [college, setCollege] = useState(social.profile?.college ?? '');
  const [username, setUsername] = useState(social.profile?.username ?? '');
  const [subjects, setSubjects] = useState((social.profile?.subjects ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await patchProfile({
            display_name: display,
            bio,
            college,
            username: username.toLowerCase(),
            subjects: subjects.split(',').map((s) => s.trim()).filter(Boolean),
          });
        } catch (er) {
          setErr(er instanceof Error ? er.message : String(er));
        } finally {
          setBusy(false);
        }
      }}
      className="relative mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2"
    >
      <Field label="Display name" value={display} onChange={setDisplay} />
      <Field label="Username" value={username} onChange={setUsername} />
      <Field label="College" value={college} onChange={setCollege} />
      <Field label="Subjects (comma separated)" value={subjects} onChange={setSubjects} />
      <Field label="Bio" value={bio} onChange={setBio} textarea />
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-4 py-2 text-xs font-semibold text-white shadow-glow sm:col-span-2 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save profile'}
      </button>
      {err && <p className="text-xs text-rose-300 sm:col-span-2">{err}</p>}
    </form>
  );
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <label className="text-xs text-white/65">
      <span className="text-[10px] uppercase tracking-widest text-white/55">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary" />
      )}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <dt className="text-[10px] uppercase tracking-widest text-white/55">{label}</dt>
      <dd className="text-sm font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <nav className="sticky top-[5rem] z-20 mt-4 -mx-4 border-b border-white/10 bg-ink/85 backdrop-blur">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors ${
              tab === t.id ? 'bg-accent text-white shadow-glow' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="mr-1" aria-hidden>{t.glyph}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---- Tabs ----

function OverviewTab({ view, onTab }: { view: ProfileView; onTab: (t: TabId) => void }) {
  const social = useSocial();
  const recent = view.isSelfView
    ? social.activity.filter((r) => r.actor_username === view.username).slice(0, 5)
    : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Uploads" value={view.stats.uploads} glyph="📤" />
        <KpiCard label="Reels watched" value={view.stats.reels_watched} glyph="🎬" />
        <KpiCard label="Quizzes" value={view.stats.quizzes_finished} glyph="❓" />
        <KpiCard label="Accuracy" value={`${view.stats.accuracy}%`} glyph="🎯" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Flashcards" value={view.stats.flashcards_reviewed} glyph="🎴" />
        <KpiCard label="Hours" value={`${view.stats.hours}h`} glyph="⏱" />
        <KpiCard label="Wins" value={view.stats.wins} glyph="🏆" />
        <KpiCard label="Losses" value={view.stats.losses} glyph="✗" />
      </div>

      <Panel title="Achievements" right={<JumpLink label="View all" onClick={() => onTab('achievements')} />}>
        <BadgeRow badges={view.badges.slice(0, 6)} />
      </Panel>

      <Panel title="Recent activity" right={<JumpLink label="View all" onClick={() => onTab('activity')} />}>
        {recent.length ? (
          <ActivityListRows rows={recent} />
        ) : (
          <p className="text-xs text-white/55">No recent activity yet.</p>
        )}
      </Panel>

      <Panel title="Favourite subjects">
        <div className="flex flex-wrap gap-2">
          {view.subjects.length === 0 && <p className="text-xs text-white/55">Add subjects in Edit profile.</p>}
          {view.subjects.map((s) => (
            <span key={s} className="rounded-full bg-gradient-to-br from-primary/15 to-accent/15 px-3 py-1 text-xs text-white">{s}</span>
          ))}
          {view.stats.favorite_subject && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
              ★ {view.stats.favorite_subject} (most uploaded)
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}

function UploadsTab({ view }: { view: ProfileView }) {
  if (!view.docs.length) return <Empty msg={view.isSelfView ? 'No uploads yet.' : `@${view.username} hasn't published any uploads yet.`} />;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {view.docs.map((d) => (
        <li key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/75">{d.subject}</span>
            <span className="ml-auto text-[10px] text-white/45">{new Date(d.created_at).toLocaleDateString()}</span>
          </div>
          <Link to={`/doc/${encodeURIComponent(d.id)}`} className="mt-1.5 block text-sm font-semibold text-white hover:text-primary-soft">{d.title}</Link>
          <p className="mt-1 text-[11px] text-white/55 tabular-nums">
            {d.counts.reel_script} reels · {d.counts.flashcard} flashcards · {d.counts.quiz} quizzes
          </p>
        </li>
      ))}
    </ul>
  );
}

function PathsTab({ view }: { view: ProfileView }) {
  if (!view.isSelfView) return <Empty msg={`@${view.username} hasn't shared their paths publicly.`} />;
  const withPaths = view.docs.filter((d) => d.counts.learning_path_step > 0);
  if (!withPaths.length) {
    return (
      <Empty msg="No learning paths yet. Upload a document to generate one.">
        <Link to="/paths" className="mt-3 inline-block text-primary">Open the paths page</Link>
      </Empty>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {withPaths.map((d) => (
        <li key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/55">{d.subject}</p>
          <Link to={`/doc/${encodeURIComponent(d.id)}`} className="mt-1 block text-sm font-semibold text-white">{d.title}</Link>
          <p className="mt-1 text-[11px] text-white/55">{d.counts.learning_path_step} steps</p>
          <Link to="/paths" className="mt-2 inline-block rounded-full bg-gradient-to-br from-primary via-secondary to-accent px-3 py-1 text-[11px] font-semibold text-white">Open path</Link>
        </li>
      ))}
    </ul>
  );
}

function AchievementsTab({ view }: { view: ProfileView }) {
  if (!view.badges.length) return <Empty msg="No badges yet." />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {view.badges.map((b) => {
        const meta = BADGE_CATALOG[b];
        if (!meta) return null;
        return (
          <div key={b} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <span className="text-3xl">{meta.glyph}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{meta.label}</p>
              <p className="text-[11px] text-white/65">{meta.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BookmarksTab({ view }: { view: ProfileView }) {
  const social = useSocial();
  if (!view.isSelfView) return <Empty msg="Bookmarks are private." />;
  if (!social.bookmarks.length) return <Empty msg="No bookmarks yet. Tap the bookmark icon on a card to save it." />;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {social.bookmarks.map((id) => (
        <li key={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/75">
          <span className="text-[10px] uppercase tracking-widest text-white/55">Artifact</span>
          <p className="mt-1 font-mono text-[11px] text-white/85">{id}</p>
        </li>
      ))}
    </ul>
  );
}

function ActivityTab({ view }: { view: ProfileView }) {
  const social = useSocial();
  const rows = view.isSelfView
    ? social.activity
    : social.activity.filter((r) => r.actor_username === view.username);
  if (!rows.length) return <Empty msg="No activity yet." />;
  if (view.isSelfView && social.profile?.hidden_activity) {
    return <Empty msg="You've hidden your activity. Re-enable in Privacy settings." />;
  }
  return <ActivityListRows rows={rows} />;
}

function StatsTab({ view }: { view: ProfileView }) {
  const items: { label: string; value: string | number }[] = [
    { label: 'Documents uploaded', value: view.stats.uploads },
    { label: 'Reels watched', value: view.stats.reels_watched },
    { label: 'Stories completed', value: view.stats.stories_completed },
    { label: 'Quizzes finished', value: view.stats.quizzes_finished },
    { label: 'Flashcards reviewed', value: view.stats.flashcards_reviewed },
    { label: 'Hours learned', value: `${view.stats.hours}h` },
    { label: 'Accuracy', value: `${view.stats.accuracy}%` },
    { label: 'Favourite subject', value: view.stats.favorite_subject ?? '—' },
    { label: 'Longest streak', value: `${view.longest_streak}d` },
    { label: 'Wins', value: view.stats.wins },
    { label: 'Losses', value: view.stats.losses },
    { label: 'Followers', value: view.followers },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((i) => (
        <li key={i.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/55">{i.label}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-white">{String(i.value)}</p>
        </li>
      ))}
    </ul>
  );
}

function FollowingTab({ view }: { view: ProfileView }) {
  if (view.followingList.length === 0) {
    return (
      <Empty msg={view.isSelfView ? "Not following anyone yet." : `@${view.username} doesn't follow anyone yet.`}>
        {view.isSelfView && <Link to="/discover" className="mt-3 inline-block text-primary">Discover learners →</Link>}
      </Empty>
    );
  }
  return <UserList users={view.followingList} />;
}

function FollowersTab({ view }: { view: ProfileView }) {
  if (view.followersList.length === 0) return <Empty msg="No followers yet." />;
  return <UserList users={view.followersList} />;
}

function NotesTab({ view }: { view: ProfileView }) {
  return <Empty msg={view.isSelfView ? 'Your public notes will appear here once you publish a note.' : `@${view.username} hasn't published any notes yet.`} />;
}

function ReelsTab({ view }: { view: ProfileView }) {
  const reels = view.docs.flatMap((d) =>
    Array.from({ length: d.counts.reel_script }).map((_, i) => ({ docId: d.id, title: d.title, idx: i })),
  );
  if (!reels.length) return <Empty msg={view.isSelfView ? 'No reels yet.' : `@${view.username} hasn't published any reels publicly.`} />;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {reels.slice(0, 24).map((r) => (
        <li key={`${r.docId}-${r.idx}`} className="aspect-[9/14] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-primary/20 via-secondary/15 to-accent/20 p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/55">Reel {r.idx + 1}</p>
          <p className="mt-1 line-clamp-3 text-xs font-semibold text-white">{r.title}</p>
          <Link to={`/?doc=${encodeURIComponent(r.docId)}`} className="mt-2 inline-block text-[11px] text-primary-soft">Watch</Link>
        </li>
      ))}
    </ul>
  );
}

function StoriesTab({ view }: { view: ProfileView }) {
  return <Empty msg={view.isSelfView ? 'Stories you complete will be listed here.' : `@${view.username} hasn't shared stories publicly.`} />;
}

function QuizTab({ view }: { view: ProfileView }) {
  const wr = view.stats.wins + view.stats.losses;
  const rate = wr ? Math.round((view.stats.wins / wr) * 100) : 0;
  const social = useSocial();
  const myCh = view.isSelfView ? social.challenges : [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Wins" value={view.stats.wins} glyph="🏆" />
        <KpiCard label="Losses" value={view.stats.losses} glyph="✗" />
        <KpiCard label="Win rate" value={`${rate}%`} glyph="🎯" />
        <KpiCard label="Total" value={wr} glyph="⚔" />
      </div>
      <Panel title="Match history">
        {myCh.length ? (
          <ul className="space-y-1.5">
            {myCh.slice(0, 12).map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                <span className="font-semibold text-white">@{(c.to?.username ?? c.from?.username) ?? '—'}</span>
                <span className="text-white/55">· {c.mode}</span>
                <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest border-white/15 bg-white/[0.04]">{c.status}</span>
                {c.status === 'finished' && c.wins_from != null && c.wins_to != null && (
                  <span className="text-[11px] text-white/65 tabular-nums">{c.wins_from} – {c.wins_to}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty msg="No matches yet. Challenge someone to start your record." />
        )}
      </Panel>
    </div>
  );
}

function LeaderboardTab({ view }: { view: ProfileView }) {
  return (
    <Panel title="Leaderboard" right={<Link to="/leaderboard" className="text-[11px] text-primary">Full board →</Link>}>
      <p className="text-xs text-white/65">
        @{view.username} ranks by XP: {view.xp.toLocaleString()}. Visit the full leaderboard for live
        rankings across global, friends, college, and subject scopes.
      </p>
    </Panel>
  );
}

// ---- Shared ----

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/55">{title}</h3>
        {right}
      </div>
      <div className="rounded-2xl border border-white/10 bg-card/40 p-3">{children}</div>
    </section>
  );
}

function JumpLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="text-[11px] text-primary hover:underline">{label}</button>;
}

function KpiCard({ label, value, glyph }: { label: string; value: string | number; glyph: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <span className="absolute right-2 top-2 text-base opacity-70">{glyph}</span>
      <p className="text-[10px] uppercase tracking-widest text-white/55">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-white">{String(value)}</p>
    </div>
  );
}

function BadgeRow({ badges }: { badges: string[] }) {
  if (!badges.length) return <p className="text-xs text-white/55">No badges yet.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {badges.map((b) => {
        const meta = BADGE_CATALOG[b];
        if (!meta) return null;
        return (
          <li key={b} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs">
            <span className="text-base">{meta.glyph}</span>
            <span className="font-semibold text-white">{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function UserList({ users }: { users: ProfileLite[] }) {
  if (!users.length) return <Empty msg="No users to show." />;
  return (
    <ul className="space-y-1.5">
      {users.map((u) => (
        <li key={u.user_id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <Avatar seed={u.avatar_seed || u.user_id} username={u.username} size={36} />
          <div className="min-w-0 flex-1">
            <Link to={`/u/${u.username}`} className="text-sm font-semibold text-white hover:text-primary-soft">
              {u.display_name || u.username}
            </Link>
            <p className="truncate text-[11px] text-white/55">@{u.username}{u.college ? ` · ${u.college}` : ''}</p>
          </div>
          <FollowButton username={u.username} />
        </li>
      ))}
    </ul>
  );
}

function FollowButton({ username }: { username: string }) {
  const following = isFollowing(username);
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => { setBusy(true); try { await toggleFollow(username); } finally { setBusy(false); } }}
      disabled={busy}
      className={`rounded-full px-3 py-1 text-[11px] font-semibold disabled:opacity-50 ${
        following ? 'border border-white/15 bg-white/[0.06] text-white' : 'bg-gradient-to-br from-primary via-secondary to-accent text-white'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

function ActivityListRows({ rows }: { rows: { id: string; actor_username?: string; actor_avatar_seed?: string; actor_display_name?: string; verb: string; object_text: string; ts: string }[] }) {
  if (!rows.length) return <p className="text-xs text-white/55">No activity yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <Avatar seed={r.actor_avatar_seed || r.actor_username || 'x'} username={r.actor_username} size={28} />
          <div className="min-w-0 flex-1 text-xs text-white/85">
            <Link to={`/u/${r.actor_username}`} className="font-semibold text-white hover:text-primary-soft">@{r.actor_username}</Link>{' '}
            {r.verb} <span className="font-semibold text-white">{r.object_text}</span>
            <p className="text-[10px] text-white/45">{relTime(r.ts)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function Empty({ msg, children }: { msg: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/55">
      {msg}
      {children}
    </div>
  );
}

function ProfileLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-32 pt-24" aria-busy="true">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/40 p-5 shadow-soft">
        <div className="flex flex-wrap items-start gap-5">
          <span className="h-[88px] w-[88px] animate-pulse rounded-full bg-white/10" />
          <div className="min-w-0 flex-1 space-y-3">
            <span className="block h-5 w-1/3 animate-pulse rounded-full bg-white/10" />
            <span className="block h-3 w-1/4 animate-pulse rounded-full bg-white/[0.06]" />
            <span className="block h-3 w-2/3 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="block h-10 animate-pulse rounded-xl bg-white/[0.05]" />
              ))}
            </div>
          </div>
        </div>
      </header>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="block h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
