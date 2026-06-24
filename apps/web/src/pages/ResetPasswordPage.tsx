import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AuthShell, IconField } from './AuthPage';

// Landing page for the password-reset email link. Supabase places a recovery
// token in the URL hash and the JS client auto-creates a recovery session on
// load (and fires a PASSWORD_RECOVERY auth event). We listen for that event
// and only render the new-password form once it has arrived.

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    // Two paths into "ready":
    //   1. The PASSWORD_RECOVERY event fires while we're mounted (typical for
    //      fresh email-link landings — the SDK parses the URL hash on load).
    //   2. The session is already present (already-recovered tab / direct nav
    //      while signed in).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
      setChecking(false);
    })();
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (password.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setInfo('Password updated. Redirecting…');
      setTimeout(() => navigate('/', { replace: true }), 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Pick a new password for your NeuroFeed account."
    >
      {checking ? (
        <p className="text-center text-body-sm text-on-surface-variant">Loading…</p>
      ) : !ready ? (
        <div className="space-y-3 text-center">
          <p className="rounded-lg border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container">
            Your reset link is invalid or has expired. Request a new one from the sign-in page.
          </p>
          <button
            onClick={() => navigate('/auth', { replace: true })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-label-md font-bold text-on-primary-container transition-all hover:brightness-95"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-md">
          <IconField
            id="new-password"
            label="New password"
            icon="lock"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            placeholder="At least 6 characters"
          />
          <IconField
            id="confirm-password"
            label="Confirm new password"
            icon="lock_reset"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Type it again"
          />
          <button
            type="submit"
            disabled={busy || !password || !confirm}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-3 text-label-md font-bold text-on-primary-container shadow-sm transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '18px' }}>progress_activity</span>
                Updating…
              </>
            ) : (
              <>
                Update password
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>check</span>
              </>
            )}
          </button>
          {err && (
            <p className="rounded-lg border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container">
              {err}
            </p>
          )}
          {info && (
            <p className="rounded-lg border border-primary/20 bg-secondary-container/40 p-3 text-body-sm text-on-secondary-container">
              {info}
            </p>
          )}
        </form>
      )}
    </AuthShell>
  );
}
