import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '@/components/social/Avatar';
import { ChallengeDialog } from '@/components/social/ChallengeDialog';
import { ErrorState } from '@/components/social/SocialStates';
import { fetchAnalytics, type AnalyticsPayload } from '@/lib/analytics';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { inferSubject, type Subject } from '@/lib/subjects';
import { BADGE_CATALOG } from '@/lib/roster';
import { friendlyError } from '@/lib/api';
import {
  bootstrap as bootstrapSocial,
  fetchFollowers,
  fetchFollowing,
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

// Profile dashboard on the new clinical light theme. Header + bento overview
// match the mockup `profilemain.html`; the remaining tabs (Uploads, Stats,
// Achievements, Bookmarks, Activity, etc.) reuse the same updated helpers but
// keep their existing data sources. All authentication, social-bootstrap, and
// view-model derivation logic is preserved from the prior dark-theme version.

type TabId =
  | 'overview'
  | 'uploads'
  | 'achievements'
  | 'stats'
  | 'following'
  | 'followers'
  | 'reels';

// Tabs shown in the TabBar when viewing your own profile. Uploads, Followers,
// and Following are deliberately omitted — they are reachable via the count
// chips in the header, so listing them in the bar would just be duplication.
const TABS_SELF: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'stats', label: 'Stats' },
  { id: 'reels', label: 'Reels' },
];

// All TabIds that can render for the self view. Used to guard the active-tab
// reset effect so clicking a count chip into "uploads" doesn't bounce us
// straight back to overview.
const SELF_RENDERABLE: TabId[] = [
  'overview',
  'uploads',
  'achievements',
  'stats',
  'followers',
  'following',
  'reels',
];

// Public tabs visible when viewing another user's profile. Anything that
// would expose private learning data is omitted; these are self-only.
const TABS_PUBLIC: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'followers', label: 'Followers' },
  { id: 'following', label: 'Following' },
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
  const visibleTabs = isSelf ? TABS_SELF : TABS_PUBLIC;
  const [tab, setTab] = useState<TabId>('overview');
  useEffect(() => {
    const allowed: TabId[] = isSelf ? SELF_RENDERABLE : TABS_PUBLIC.map((t) => t.id);
    if (!allowed.includes(tab)) setTab('overview');
  }, [isSelf, tab]);

  const [self, setSelf] = useState<SelfData | null>(null);
  const [selfFollowers, setSelfFollowers] = useState<ProfileLite[]>([]);
  const [other, setOther] = useState<ProfileMeta | null>(null);
  const [otherDocs, setOtherDocs] = useState<DocSummary[]>([]);
  const [otherFollowers, setOtherFollowers] = useState<ProfileLite[]>([]);
  const [otherFollowing, setOtherFollowing] = useState<ProfileLite[]>([]);
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
        // Fan out followers + following + docs in parallel — they used to chain
        // serially, which doubled the time-to-first-paint on /u/:username
        // navigations.
        const apiBase = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000';
        const [followers, following, docs] = await Promise.all([
          fetchFollowers(p.username).catch(() => [] as ProfileLite[]),
          fetchFollowing(p.username).catch(() => [] as ProfileLite[]),
          fetch(`${apiBase}/api/documents?user_id=${encodeURIComponent(p.user_id)}`)
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .catch(() => ({ items: [] })),
        ]);
        setOtherFollowers(followers);
        setOtherFollowing(following);
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

  // Fetch the signed-in user's own followers list once their social profile
  // has hydrated (username is the input to the /api/follows/followers endpoint).
  // bootstrap() only populates the `following` array — followers are not part
  // of the initial snapshot, so the Followers tab needs a dedicated fetch.
  const selfUsername = social.profile?.username;
  useEffect(() => {
    if (!isSelf || !selfUsername) return;
    let cancelled = false;
    void (async () => {
      try {
        const f = await fetchFollowers(selfUsername);
        if (!cancelled) setSelfFollowers(f);
      } catch {
        if (!cancelled) setSelfFollowers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isSelf, selfUsername]);

  const view = useMemo(
    () => buildView({ isSelf, social, self, selfFollowers, other, otherDocs, otherFollowers, otherFollowing }),
    [isSelf, social, self, selfFollowers, other, otherDocs, otherFollowers, otherFollowing],
  );

  // -------- Loading / error / signed-out states --------
  if (isSelf && authReady && signedIn === false) {
    return (
      <div className="mx-auto max-w-md px-md pb-xl pt-xl text-center">
        <p className="text-headline-sm text-on-surface">You're signed out.</p>
        <p className="mt-1 text-body-sm text-on-surface-variant">Sign in to view your profile.</p>
        <Link
          to="/auth"
          className="mt-md inline-flex items-center gap-2 rounded-lg bg-primary-container px-5 py-2.5 text-label-md font-bold text-on-primary-container transition-all hover:brightness-95"
        >
          Sign in
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
        </Link>
      </div>
    );
  }
  if (isSelf && selfErr) {
    return <ErrorWrap title="Couldn't load your profile" message={selfErr} onRetry={() => void loadSelf()} />;
  }
  if (!isSelf && otherErr) {
    return <ErrorWrap title="Couldn't load this profile" message={otherErr} onRetry={() => void loadOther()} />;
  }
  if (!view) {
    if (isSelf && (!authReady || !social.ready || !self)) return <ProfileLoadingSkeleton />;
    if (isSelf && self && !social.profile) {
      return (
        <ErrorWrap
          title="Profile not synced yet"
          message="We couldn't load your profile data. Try again."
          onRetry={() => {
            void bootstrapSocial(self.userId);
            void loadSelf();
          }}
        />
      );
    }
    return (
      <div className="px-md py-xl text-center text-body-sm text-on-surface-variant">
        No profile found for @{params.username}.
        <div className="mt-3">
          <Link to="/discover" className="text-primary hover:underline">Discover learners →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-md py-md">
      <Header view={view} isSelf={isSelf} onTab={setTab} />
      <TabBar tabs={visibleTabs} tab={tab} onTab={setTab} />
      <main className="space-y-md py-md">
        {tab === 'overview' && <OverviewTab view={view} onTab={setTab} />}
        {tab === 'uploads' && <UploadsTab view={view} />}
        {tab === 'achievements' && <AchievementsTab view={view} />}
        {tab === 'stats' && <StatsTab view={view} />}
        {tab === 'following' && <FollowingTab view={view} />}
        {tab === 'followers' && <FollowersTab view={view} />}
        {tab === 'reels' && <ReelsTab view={view} />}
      </main>
    </div>
  );
}

function ErrorWrap({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md px-md pb-xl pt-xl">
      <ErrorState title={title} message={message} onRetry={onRetry} />
    </div>
  );
}

// ---- View model (unchanged from the prior version) ----

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
  selfFollowers: ProfileLite[];
  other: ProfileMeta | null;
  otherDocs: DocSummary[];
  otherFollowers: ProfileLite[];
  otherFollowing: ProfileLite[];
}): ProfileView | null {
  const { isSelf, social, self, selfFollowers, other, otherDocs, otherFollowers, otherFollowing } = args;
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
      followersList: selfFollowers,
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
    followingList: otherFollowing,
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
  return Array.from(map.entries()).map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count);
}

// ---- Header (mockup-fidelity) ----

function Header({ view, isSelf, onTab }: { view: ProfileView; isSelf: boolean; onTab: (t: TabId) => void }) {
  const following = isFollowing(view.username);
  const friend = isFriend(view.username);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
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
    setBusy(true); setErr(null);
    try { await toggleFollow(view.username); } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function onFriend() {
    setBusy(true); setErr(null);
    try { await sendFriendRequest(view.username); } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
      <div className="flex flex-col items-start gap-md md:flex-row">
        {/* Avatar with gradient ring + verified badge */}
        <div className="relative shrink-0">
          <div className="rounded-full bg-gradient-to-tr from-primary to-tertiary p-1">
            <div className="rounded-full border-4 border-surface">
              <Avatar seed={view.avatar_seed} username={view.username} size={120} linkTo={false} />
            </div>
          </div>
          <div className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-surface bg-primary text-on-primary">
            <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
          </div>
        </div>

        {/* Bio column */}
        <div className="min-w-0 flex-1 space-y-sm">
          <div className="flex flex-wrap items-center gap-sm">
            <h1 className="text-headline-md text-on-surface">@{view.username}</h1>
            {isSelf && (
              <span className="rounded-full bg-primary-container/40 px-2 py-0.5 text-label-sm font-bold text-on-primary-container">
                L{view.level}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-base">
            {isSelf ? (
              <>
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-lg bg-primary px-md py-base text-label-md font-medium text-on-primary shadow-sm transition-colors hover:bg-on-primary-container"
                >
                  {editing ? 'Done editing' : 'Edit Profile'}
                </button>
                <Link
                  to="/settings/privacy"
                  className="rounded-lg bg-surface-container-high px-md py-base text-label-md text-on-surface transition-colors hover:bg-surface-dim"
                >
                  Privacy
                </Link>
                <button
                  onClick={onSignOut}
                  disabled={signingOut}
                  className="rounded-lg bg-surface-container-high px-md py-base text-label-md text-on-surface transition-colors hover:bg-surface-dim disabled:opacity-50"
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onFollow}
                  disabled={busy}
                  className={
                    following
                      ? 'rounded-lg bg-surface-container-high px-md py-base text-label-md text-on-surface transition-colors hover:bg-surface-dim disabled:opacity-50'
                      : 'rounded-lg bg-primary px-md py-base text-label-md font-medium text-on-primary shadow-sm transition-colors hover:bg-on-primary-container disabled:opacity-50'
                  }
                >
                  {following ? 'Following' : 'Follow'}
                </button>
                {friend ? (
                  <span className="rounded-lg bg-secondary-container/40 px-md py-base text-label-md font-medium text-on-secondary-container">
                    Friends ✓
                  </span>
                ) : (
                  <button
                    onClick={onFriend}
                    disabled={busy}
                    className="rounded-lg bg-surface-container-high px-md py-base text-label-md text-on-surface transition-colors hover:bg-surface-dim disabled:opacity-50"
                  >
                    Add friend
                  </button>
                )}
                <button
                  onClick={() => setChallengeOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-tertiary-container/40 px-md py-base text-label-md font-medium text-on-tertiary-container transition-colors hover:bg-tertiary-container/60"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>swords</span>
                  Challenge
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`${location.origin}/u/${view.username}`);
                    alert('Profile link copied');
                  }}
                  aria-label="Share profile"
                  className="rounded-lg bg-surface-container-high p-base text-on-surface transition-colors hover:bg-surface-dim"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>share</span>
                </button>
              </>
            )}
          </div>

          {/* Counts row — each chip jumps to its tab. */}
          <div className="flex gap-lg border-y border-outline-variant/40 py-sm">
            <CountChip value={view.stats.uploads} label="Uploads" onClick={() => onTab('uploads')} />
            <CountChip value={view.followers} label="Followers" onClick={() => onTab('followers')} />
            <CountChip value={view.following} label="Following" onClick={() => onTab('following')} />
          </div>

          {/* Display name + bio + subjects */}
          {view.display_name && view.display_name !== view.username && (
            <h3 className="text-body-md font-bold text-on-surface">{view.display_name}</h3>
          )}
          <p className="max-w-prose text-body-md text-on-surface-variant">{view.bio || 'No bio yet.'}</p>
          {view.subjects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {view.subjects.slice(0, 6).map((s) => (
                <span key={s} className="rounded-full border border-outline-variant bg-surface-container px-3 py-0.5 text-label-sm text-on-surface-variant">
                  {s}
                </span>
              ))}
              {view.college && (
                <span className="rounded-full border border-secondary-container bg-secondary-container/30 px-3 py-0.5 text-label-sm text-on-secondary-container">
                  {view.college}
                </span>
              )}
            </div>
          )}

          {/* Gamification chips (self only — XP/streak are private learning signals) */}
          {isSelf && (
            <div className="flex flex-wrap gap-base pt-xs">
              <div className="inline-flex items-center gap-xs rounded-full border border-secondary-container bg-secondary-container/30 px-sm py-xs text-label-sm text-on-secondary-container">
                <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                <span>{view.streak} Day Streak</span>
              </div>
              <div className="inline-flex items-center gap-xs rounded-full border border-tertiary-container bg-tertiary-container/30 px-sm py-xs text-label-sm text-on-tertiary-container">
                <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <span>XP Level {view.level}</span>
              </div>
            </div>
          )}

          {err && <p className="text-label-sm text-error">{err}</p>}
        </div>
      </div>

      {isSelf && editing && <EditProfileForm />}
      <ChallengeDialog
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        opponent={{
          username: view.username,
          display_name: view.display_name,
          avatar_seed: view.avatar_seed,
        }}
      />
    </section>
  );
}

function CountChip({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1 rounded-md px-1 text-left transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="text-body-lg font-bold text-on-surface tabular-nums">{value.toLocaleString()}</span>
      <span className="ml-1 text-label-md text-on-surface-variant">{label}</span>
    </button>
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
        setBusy(true); setErr(null);
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
      className="mt-md grid grid-cols-1 gap-sm rounded-lg border border-outline-variant bg-surface-container-low p-md sm:grid-cols-2"
    >
      <EditField label="Display name" value={display} onChange={setDisplay} />
      <EditField label="Username" value={username} onChange={setUsername} />
      <EditField label="College" value={college} onChange={setCollege} />
      <EditField label="Subjects (comma separated)" value={subjects} onChange={setSubjects} />
      <EditField label="Bio" value={bio} onChange={setBio} textarea />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-bold text-on-primary-container shadow-sm transition-all hover:brightness-95 disabled:opacity-50 sm:col-span-2"
      >
        {busy ? 'Saving…' : 'Save profile'}
      </button>
      {err && <p className="text-label-sm text-error sm:col-span-2">{err}</p>}
    </form>
  );
}

function EditField({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <label className="block">
      <span className="mb-xs block text-label-sm text-on-surface-variant">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
      )}
    </label>
  );
}

function TabBar({ tabs, tab, onTab }: { tabs: { id: TabId; label: string }[]; tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <nav className="sticky top-16 z-20 -mx-md mt-md border-y border-outline-variant/40 bg-background/90 backdrop-blur-sm">
      <div className="no-scrollbar flex gap-md overflow-x-auto px-md py-2 text-label-sm uppercase tracking-widest">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={
                active
                  ? 'shrink-0 border-b-2 border-primary pb-2 text-primary'
                  : 'shrink-0 border-b-2 border-transparent pb-2 text-on-surface-variant transition-colors hover:text-primary'
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---- Overview: bento grid matching the mockup ----

function OverviewTab({ view, onTab }: { view: ProfileView; onTab: (t: TabId) => void }) {
  const social = useSocial();
  if (!view.isSelfView) return <PublicOverviewTab view={view} onTab={onTab} />;
  const nextLevelXp = (view.level + 1) * 250;
  const pctToNext = Math.min(1, (view.xp - view.level * 250) / 250);

  return (
    <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
      {/* XP card */}
      <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-md md:col-span-4">
        <span className="text-label-md uppercase tracking-wider text-on-surface-variant">Total Experience</span>
        <div className="mt-2 flex items-baseline gap-2">
          <h2 className="text-display text-primary tabular-nums">{view.xp.toLocaleString()}</h2>
          <span className="text-label-sm text-on-surface-variant">XP</span>
        </div>
        <div className="mt-md">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
            <div className="h-full bg-primary" style={{ width: `${pctToNext * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-label-sm text-on-surface-variant">
            <span>Level {view.level}</span>
            <span>Next: {(nextLevelXp - view.xp).toLocaleString()} XP</span>
          </div>
        </div>
      </div>

      {/* Streak card */}
      <div className="rounded-xl bg-tertiary p-md text-on-tertiary md:col-span-4">
        <div className="text-label-md uppercase tracking-wider text-tertiary-fixed-dim">Current Streak</div>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="material-symbols-outlined text-secondary-container"
            style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            local_fire_department
          </span>
          <h2 className="text-display">{view.streak}</h2>
          <span className="text-label-md text-tertiary-fixed-dim">Days</span>
        </div>
        <div className="mt-md flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i < (view.streak % 7) ? 'bg-white' : 'bg-white/20'}`}
            />
          ))}
        </div>
      </div>

      {/* Mastery / recent doc */}
      <div className="rounded-xl bg-surface-container p-md md:col-span-4">
        <h3 className="mb-md text-label-md uppercase tracking-wider text-on-surface-variant">
          Continue Learning
        </h3>
        {view.docs[0] ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-lowest text-primary shadow-sm">
                <span className="material-symbols-outlined">neurology</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-label-md text-on-surface">{view.docs[0].title}</p>
                <p className="text-label-sm text-on-surface-variant">
                  {view.docs[0].counts.reel_script} reels · {view.docs[0].counts.flashcard} cards
                </p>
              </div>
            </div>
            <Link
              to={`/doc/${encodeURIComponent(view.docs[0].id)}`}
              className="mt-md block rounded-lg border border-outline-variant bg-surface-container-lowest py-2 text-center text-label-md text-on-surface transition-all hover:bg-surface-container-low"
            >
              Resume Learning
            </Link>
          </>
        ) : (
          <p className="text-body-sm text-on-surface-variant">
            No documents yet. <Link to="/upload" className="text-primary hover:underline">Upload one</Link>.
          </p>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 md:col-span-12 md:grid-cols-5">
        <KpiTile icon="upload_file" value={view.stats.uploads} label="Uploads" />
        <KpiTile icon="smart_display" value={view.stats.reels_watched} label="Reels watched" />
        <KpiTile icon="quiz" value={`${view.stats.accuracy}%`} label="Avg score" />
        <KpiTile icon="schedule" value={`${view.stats.hours}h`} label="Hours" />
        <KpiTile icon="military_tech" value={`${view.stats.wins} / ${view.stats.losses}`} label="Wins / Losses" />
      </div>

      {/* Left col: recent uploads */}
      <div className="space-y-md md:col-span-8">
        <SectionHead title="Recent Uploads" onAction={() => onTab('uploads')} />
        {view.docs.length === 0 ? (
          <EmptyTile msg="No uploads yet." />
        ) : (
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
            {view.docs.slice(0, 3).map((d) => (
              <UploadTile key={d.id} d={d} />
            ))}
          </div>
        )}
      </div>

      {/* Right col: recently earned + privacy */}
      <div className="space-y-md md:col-span-4">
        <SectionHead title="Recently Earned" onAction={() => onTab('achievements')} />
        <div className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          {view.badges.slice(0, 3).map((b) => {
            const meta = BADGE_CATALOG[b];
            if (!meta) return null;
            return (
              <div key={b} className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary-container bg-surface-container text-2xl">
                  {meta.glyph}
                </div>
                <div>
                  <h4 className="text-label-md text-on-surface">{meta.label}</h4>
                  <p className="text-label-sm text-on-surface-variant">{meta.description}</p>
                </div>
              </div>
            );
          })}
          {view.badges.length === 0 && (
            <p className="text-body-sm text-on-surface-variant">No badges yet — finish a quiz to earn your first.</p>
          )}
        </div>

        <div className="rounded-xl border border-tertiary-container/40 bg-tertiary-container/15 p-md">
          <div className="mb-2 flex items-center gap-2 text-on-tertiary-container">
            <span className="material-symbols-outlined">info</span>
            <span className="text-label-md font-bold">Privacy Status</span>
          </div>
          <p className="mb-md text-label-sm text-on-tertiary-fixed-variant">
            Your profile is {social.profile?.is_public ? 'visible to everyone' : 'private to followers'}.
          </p>
          <Link to="/settings/privacy" className="text-label-sm font-bold text-on-tertiary-fixed underline">
            Update Visibility
          </Link>
        </div>
      </div>
    </div>
  );
}

// Public-facing overview shown when viewing another user's profile. Only
// surfaces the user's published uploads + badges they've earned — no XP,
// streak, KPI tiles, activity feed, or progress data.
function PublicOverviewTab({ view, onTab }: { view: ProfileView; onTab: (t: TabId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
      <div className="space-y-md md:col-span-8">
        <SectionHead title="Recent Uploads" onAction={() => onTab('uploads')} />
        {view.docs.length === 0 ? (
          <EmptyTile msg={`@${view.username} hasn't shared any uploads yet.`} />
        ) : (
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
            {view.docs.slice(0, 3).map((d) => (
              <UploadTile key={d.id} d={d} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-md md:col-span-4">
        <SectionHead title="Recently Earned" onAction={() => onTab('achievements')} />
        <div className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          {view.badges.slice(0, 3).map((b) => {
            const meta = BADGE_CATALOG[b];
            if (!meta) return null;
            return (
              <div key={b} className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary-container bg-surface-container text-2xl">
                  {meta.glyph}
                </div>
                <div>
                  <h4 className="text-label-md text-on-surface">{meta.label}</h4>
                  <p className="text-label-sm text-on-surface-variant">{meta.description}</p>
                </div>
              </div>
            );
          })}
          {view.badges.length === 0 && (
            <p className="text-body-sm text-on-surface-variant">No badges yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center">
      <span className="material-symbols-outlined mb-1 text-primary" aria-hidden>
        {icon}
      </span>
      <div className="text-headline-sm text-on-surface tabular-nums">{String(value)}</div>
      <div className="text-label-sm text-on-surface-variant">{label}</div>
    </div>
  );
}

function SectionHead({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-headline-sm text-on-surface">{title}</h3>
      {onAction && (
        <button onClick={onAction} className="text-label-md text-primary hover:underline">
          View all
        </button>
      )}
    </div>
  );
}

function UploadTile({ d }: { d: DocSummary & { subject: Subject } }) {
  return (
    <Link
      to={`/doc/${encodeURIComponent(d.id)}`}
      className="group block overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest transition-colors hover:border-primary/30"
    >
      <div
        className="relative aspect-video"
        style={{
          background: `linear-gradient(135deg, hsl(${hashHue(d.title)} 65% 35%), hsl(${(hashHue(d.title) + 80) % 360} 65% 45%))`,
        }}
      >
        <span className="absolute right-2 top-2 rounded bg-surface/90 px-2 py-0.5 text-label-sm text-on-surface shadow-sm">
          {(d.source_type ?? 'doc').toUpperCase()}
        </span>
      </div>
      <div className="p-md">
        <p className="truncate text-label-md text-on-surface group-hover:text-primary">{d.title}</p>
        <p className="text-label-sm text-on-surface-variant">{d.subject}</p>
      </div>
    </Link>
  );
}

// ---- Other tabs (light-themed retrofit) ----

function UploadsTab({ view }: { view: ProfileView }) {
  if (!view.docs.length) return <Empty msg={view.isSelfView ? 'No uploads yet.' : `@${view.username} hasn't published any uploads yet.`} />;
  return (
    <ul className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
      {view.docs.map((d) => (
        <li key={d.id}>
          <UploadTile d={d} />
        </li>
      ))}
    </ul>
  );
}

function AchievementsTab({ view }: { view: ProfileView }) {
  if (!view.badges.length) return <Empty msg="No badges yet." />;
  return (
    <div className="grid grid-cols-2 gap-gutter sm:grid-cols-3">
      {view.badges.map((b) => {
        const meta = BADGE_CATALOG[b];
        if (!meta) return null;
        return (
          <div key={b} className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <span className="text-3xl">{meta.glyph}</span>
            <div className="min-w-0">
              <p className="text-label-md font-bold text-on-surface">{meta.label}</p>
              <p className="text-label-sm text-on-surface-variant">{meta.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsTab({ view }: { view: ProfileView }) {
  const items: { label: string; value: string | number; icon: string }[] = [
    { label: 'Documents uploaded', value: view.stats.uploads, icon: 'upload_file' },
    { label: 'Reels watched', value: view.stats.reels_watched, icon: 'smart_display' },
    { label: 'Quizzes finished', value: view.stats.quizzes_finished, icon: 'quiz' },
    { label: 'Flashcards reviewed', value: view.stats.flashcards_reviewed, icon: 'style' },
    { label: 'Hours learned', value: `${view.stats.hours}h`, icon: 'schedule' },
    { label: 'Accuracy', value: `${view.stats.accuracy}%`, icon: 'target' },
    { label: 'Favourite subject', value: view.stats.favorite_subject ?? '—', icon: 'star' },
    { label: 'Longest streak', value: `${view.longest_streak}d`, icon: 'local_fire_department' },
    { label: 'Wins', value: view.stats.wins, icon: 'military_tech' },
    { label: 'Losses', value: view.stats.losses, icon: 'close' },
    { label: 'Followers', value: view.followers, icon: 'group' },
    { label: 'Following', value: view.following, icon: 'person_add' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-gutter sm:grid-cols-3">
      {items.map((i) => (
        <li key={i.label} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <div className="mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>{i.icon}</span>
            <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">{i.label}</p>
          </div>
          <p className="text-headline-sm font-bold tabular-nums text-on-surface">{String(i.value)}</p>
        </li>
      ))}
    </ul>
  );
}

function FollowingTab({ view }: { view: ProfileView }) {
  if (view.followingList.length === 0) {
    return (
      <Empty msg={view.isSelfView ? "Not following anyone yet." : `@${view.username} doesn't follow anyone yet.`}>
        {view.isSelfView && <Link to="/discover" className="mt-3 inline-block text-primary hover:underline">Discover learners →</Link>}
      </Empty>
    );
  }
  return <UserList users={view.followingList} />;
}

function FollowersTab({ view }: { view: ProfileView }) {
  if (view.followersList.length === 0) return <Empty msg="No followers yet." />;
  return <UserList users={view.followersList} />;
}

function ReelsTab({ view }: { view: ProfileView }) {
  const reels = view.docs.flatMap((d) =>
    Array.from({ length: d.counts.reel_script }).map((_, i) => ({ docId: d.id, title: d.title, idx: i })),
  );
  if (!reels.length) return <Empty msg={view.isSelfView ? 'No reels yet.' : `@${view.username} hasn't published any reels publicly.`} />;
  return (
    <ul className="grid grid-cols-2 gap-gutter sm:grid-cols-3">
      {reels.slice(0, 24).map((r) => (
        <li
          key={`${r.docId}-${r.idx}`}
          className="aspect-[9/14] overflow-hidden rounded-xl text-white"
          style={{
            background: `linear-gradient(135deg, hsl(${hashHue(r.title)} 65% 35%), hsl(${(hashHue(r.title) + 80) % 360} 65% 45%))`,
          }}
        >
          <div className="flex h-full flex-col justify-between p-md">
            <p className="text-label-sm uppercase tracking-widest opacity-80">Reel {r.idx + 1}</p>
            <div>
              <p className="line-clamp-3 text-label-md font-bold">{r.title}</p>
              <Link to={`/?doc=${encodeURIComponent(r.docId)}`} className="mt-2 inline-block text-label-sm underline opacity-90">Watch</Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- Shared building blocks ----

function UserList({ users }: { users: ProfileLite[] }) {
  const social = useSocial();
  const myUsername = social.profile?.username;
  if (!users.length) return <Empty msg="No users to show." />;
  return (
    <ul className="space-y-2">
      {users.map((u) => {
        const isMe = !!myUsername && u.username === myUsername;
        return (
          <li key={u.user_id} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <Avatar seed={u.avatar_seed || u.user_id} username={u.username} size={40} />
            <div className="min-w-0 flex-1">
              <Link to={`/u/${u.username}`} className="text-label-md font-bold text-on-surface hover:text-primary">
                {u.display_name || u.username}
              </Link>
              <p className="truncate text-label-sm text-on-surface-variant">
                @{u.username}{u.college ? ` · ${u.college}` : ''}
              </p>
            </div>
            {isMe ? (
              <span className="rounded-full bg-surface-container px-3 py-1 text-label-sm font-bold text-on-surface-variant">
                You
              </span>
            ) : (
              <FollowButton username={u.username} />
            )}
          </li>
        );
      })}
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
      className={
        following
          ? 'rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-label-sm font-bold text-on-surface disabled:opacity-50'
          : 'rounded-full bg-primary-container px-3 py-1 text-label-sm font-bold text-on-primary-container disabled:opacity-50'
      }
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

function Empty({ msg, children }: { msg: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant p-xl text-center text-body-sm text-on-surface-variant">
      {msg}
      {children}
    </div>
  );
}

function EmptyTile({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant p-md text-center text-label-sm text-on-surface-variant">
      {msg}
    </div>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function ProfileLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-md py-md" aria-busy="true">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <div className="flex flex-wrap items-start gap-md">
          <span className="h-[120px] w-[120px] animate-pulse rounded-full bg-surface-container" />
          <div className="min-w-0 flex-1 space-y-3">
            <span className="block h-6 w-1/3 animate-pulse rounded-full bg-surface-container" />
            <span className="block h-4 w-1/4 animate-pulse rounded-full bg-surface-container-low" />
            <span className="block h-4 w-2/3 animate-pulse rounded-full bg-surface-container-low" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="block h-12 animate-pulse rounded-lg bg-surface-container-low" />
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="mt-md flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-7 w-20 animate-pulse rounded-full bg-surface-container-low" />
        ))}
      </div>
      <div className="mt-md grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="block h-20 animate-pulse rounded-xl bg-surface-container-low" />
        ))}
      </div>
    </div>
  );
}
