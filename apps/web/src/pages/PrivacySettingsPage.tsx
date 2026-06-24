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

const VISIBILITY_OPTS: { id: Visibility; label: string; description: string }[] = [
  { id: 'private', label: 'Private', description: 'Only you can see it.' },
  { id: 'friends', label: 'Friends', description: 'Only people you’ve accepted as friends.' },
  { id: 'public', label: 'Public', description: 'Visible to anyone on NeuroFeed.' },
];

export default function PrivacySettingsPage() {
  const social = useSocial();
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
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-24">
      <header>
        <p className="text-[10px] uppercase tracking-widest text-white/55">Settings</p>
        <h1 className="text-2xl font-bold text-white">Privacy</h1>
        <p className="mt-1 text-sm text-white/65">
          Control who sees your profile, uploads, activity, and quiz records.
        </p>
      </header>

      <section className="mt-5 space-y-3">
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

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/55">Per-document visibility</h2>
        <p className="mt-1 text-[11px] text-white/55">Override the default per upload.</p>
        {docs.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/55">
            No uploads yet.<br />
            <Link to="/upload" className="mt-2 inline-block text-primary">Upload a document →</Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {docs.map((d) => {
              const cur = (social.doc_visibility[d.id] as Visibility) ?? social.privacy.uploads;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{d.title}</span>
                  <div className="flex shrink-0 gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                    {VISIBILITY_OPTS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => safePatch(() => setDocVisibility(d.id, o.id))}
                        disabled={busy}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors disabled:opacity-50 ${
                          cur === o.id
                            ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white'
                            : 'text-white/65 hover:bg-white/10 hover:text-white'
                        }`}
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-[11px] text-white/65">{description}</p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
          {VISIBILITY_OPTS.map((o) => (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              disabled={disabled}
              title={o.description}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors disabled:opacity-50 ${
                value === o.id
                  ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-[11px] text-white/65">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          value ? 'bg-gradient-to-br from-primary to-accent shadow-glow' : 'bg-white/15'
        }`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 inline-block h-5 w-5 rounded-full bg-white transition-transform ${
            value ? 'translate-x-[1.4rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
