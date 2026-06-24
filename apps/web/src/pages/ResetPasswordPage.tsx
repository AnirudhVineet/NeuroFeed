import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

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
    // 1. The PASSWORD_RECOVERY event fires while we're mounted (typical for
    //    fresh email-link landings — the SDK parses the URL hash on load).
    // 2. The session is already present (already-recovered tab / direct nav
    //    while signed in).
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
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a new password for your NeuroFeed account.
        </p>
      </div>

      {checking ? (
        <p className="text-center text-sm text-white/55">Loading…</p>
      ) : !ready ? (
        <div className="space-y-3 text-center">
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            Your reset link is invalid or has expired. Request a new one from the sign-in page.
          </p>
          <button
            onClick={() => navigate('/auth', { replace: true })}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field
            label="New password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            placeholder="At least 6 characters"
          />
          <Field
            label="Confirm new password"
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
            className="w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
          {err && (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-sm text-rose-200">{err}</p>
          )}
          {info && (
            <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 text-sm text-emerald-100">{info}</p>
          )}
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-white/55">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none placeholder:text-white/35 focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
    </label>
  );
}
