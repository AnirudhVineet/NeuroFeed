import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  patchPrivacy,
  patchProfile,
  setDocVisibility,
  useSocial,
  type Visibility,
} from '@/lib/social';
import { fetchDocuments, type DocSummary } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';
import { useTheme, type ThemePref } from '@/lib/theme';

const VISIBILITY_OPTS: { id: Visibility; label: string; description: string }[] = [
  { id: 'private', label: 'Private', description: 'Only you can see it.' },
  { id: 'friends', label: 'Friends', description: 'Only people you’ve accepted as friends.' },
  { id: 'public', label: 'Public', description: 'Visible to anyone on NeuroFeed.' },
];

const THEME_OPTS: { id: ThemePref; label: string; description: string; icon: string }[] = [
  { id: 'light', label: 'Light', description: 'Bright clinical surface.', icon: 'light_mode' },
  { id: 'dark', label: 'Dark', description: 'Deep navy ink surface.', icon: 'dark_mode' },
  { id: 'system', label: 'System', description: 'Follow your OS preference.', icon: 'computer' },
];

export default function PrivacySettingsPage() {
  const social = useSocial();
  const { pref: themePref, setTheme } = useTheme();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const d = await fetchDocuments(uid);
      setDocs(d.items);
    })();
  }, []);

  const hiddenActivity = social.profile?.hidden_activity ?? false;
  const isPublic = social.profile?.is_public ?? true;

  async function safePatch(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-md">
      <header>
        <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">Settings</p>
        <h1 className="text-headline-md text-on-surface">Preferences</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Appearance, privacy, and per-upload visibility — all in one place.
        </p>
      </header>

      <section className="mt-md">
        <h2 className="mb-2 text-label-md uppercase tracking-widest text-on-surface-variant">Appearance</h2>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-label-md font-bold text-on-surface">Theme</p>
              <p className="text-label-sm text-on-surface-variant">
                Switch between light and dark, or follow your operating system.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="flex shrink-0 gap-1 rounded-full border border-outline-variant bg-surface-container p-1"
            >
              {THEME_OPTS.map((o) => {
                const active = themePref === o.id;
                return (
                  <button
                    key={o.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(o.id)}
                    title={o.description}
                    className={
                      active
                        ? 'inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-label-sm font-bold text-on-primary-container'
                        : 'inline-flex items-center gap-1 rounded-full px-3 py-1 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface'
                    }
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{o.icon}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-md space-y-3">
        <h2 className="text-label-md uppercase tracking-widest text-on-surface-variant">Privacy</h2>
        <PrivacyRow
          label="Profile visibility"
          description="Who can open your profile page."
          value={social.privacy.profile}
          onChange={(v) => safePatch(() => patchPrivacy({ profile: v }))}
          disabled={busy}
        />
        <PrivacyRow
          label="Uploads (default)"
          description="The default visibility for documents you upload. Per-document overrides below."
          value={social.privacy.uploads}
          onChange={(v) => safePatch(() => patchPrivacy({ uploads: v }))}
          disabled={busy}
        />
        <PrivacyRow
          label="Followers list"
          description="Who can see who follows you."
          value={social.privacy.followers}
          onChange={(v) => safePatch(() => patchPrivacy({ followers: v }))}
          disabled={busy}
        />
        <PrivacyRow
          label="Activity feed"
          description="Who can see what you've been studying."
          value={social.privacy.activity}
          onChange={(v) => safePatch(() => patchPrivacy({ activity: v }))}
          disabled={busy}
        />
        <PrivacyRow
          label="Quiz records"
          description="Who can see your wins, losses, and win-rate."
          value={social.privacy.quiz_records}
          onChange={(v) => safePatch(() => patchPrivacy({ quiz_records: v }))}
          disabled={busy}
        />
        <PrivacyRow
          label="Achievements"
          description="Who can see your earned badges."
          value={social.privacy.achievements}
          onChange={(v) => safePatch(() => patchPrivacy({ achievements: v }))}
          disabled={busy}
        />
        <Toggle
          label="Participate in leaderboards"
          description="If off, you won't appear on global, friends, or college leaderboards."
          value={social.privacy.leaderboard}
          onChange={(v) => safePatch(() => patchPrivacy({ leaderboard: v }))}
          disabled={busy}
        />
        <Toggle
          label="Profile is discoverable"
          description="If off, others can't find you on Discover or open your profile."
          value={isPublic}
          onChange={(v) => safePatch(() => patchProfile({ is_public: v }))}
          disabled={busy}
        />
        <Toggle
          label="Hide my activity entirely"
          description="Master switch: pause broadcasting any new activity."
          value={hiddenActivity}
          onChange={(v) => safePatch(() => patchProfile({ hidden_activity: v }))}
          disabled={busy}
        />
      </section>

      <section className="mt-md">
        <h2 className="mb-2 text-label-md uppercase tracking-widest text-on-surface-variant">Per-document visibility</h2>
        <p className="mb-2 text-label-sm text-on-surface-variant">Override the default per upload.</p>
        {docs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant p-md text-center text-body-sm text-on-surface-variant">
            No uploads yet.<br />
            <Link to="/upload" className="mt-2 inline-block text-primary hover:underline">Upload a document →</Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => {
              const cur = (social.doc_visibility[d.id] as Visibility) ?? social.privacy.uploads;
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-on-surface">{d.title}</span>
                  <div className="flex shrink-0 gap-1 rounded-full border border-outline-variant bg-surface-container p-1">
                    {VISIBILITY_OPTS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => safePatch(() => setDocVisibility(d.id, o.id))}
                        disabled={busy}
                        className={
                          cur === o.id
                            ? 'rounded-full bg-primary-container px-2.5 py-1 text-label-sm font-bold capitalize text-on-primary-container disabled:opacity-50'
                            : 'rounded-full px-2.5 py-1 text-label-sm capitalize text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50'
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PrivacyRow({
  label, description, value, onChange, disabled,
}: {
  label: string; description: string; value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-label-md font-bold text-on-surface">{label}</p>
          <p className="text-label-sm text-on-surface-variant">{description}</p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-full border border-outline-variant bg-surface-container p-1">
          {VISIBILITY_OPTS.map((o) => (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              disabled={disabled}
              title={o.description}
              className={
                value === o.id
                  ? 'rounded-full bg-primary-container px-2.5 py-1 text-label-sm font-bold capitalize text-on-primary-container disabled:opacity-50'
                  : 'rounded-full px-2.5 py-1 text-label-sm capitalize text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50'
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label, description, value, onChange, disabled,
}: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="min-w-0">
        <p className="text-label-md font-bold text-on-surface">{label}</p>
        <p className="text-label-sm text-on-surface-variant">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        disabled={disabled}
        className={
          value
            ? 'relative h-6 w-11 shrink-0 rounded-full bg-primary transition-colors disabled:opacity-50'
            : 'relative h-6 w-11 shrink-0 rounded-full bg-surface-container-highest transition-colors disabled:opacity-50'
        }
        aria-pressed={value}
      >
        <span
          className={
            value
              ? 'absolute top-0.5 inline-block h-5 w-5 translate-x-[1.4rem] rounded-full bg-on-primary transition-transform'
              : 'absolute top-0.5 inline-block h-5 w-5 translate-x-0.5 rounded-full bg-surface-container-lowest transition-transform'
          }
        />
      </button>
    </div>
  );
}
