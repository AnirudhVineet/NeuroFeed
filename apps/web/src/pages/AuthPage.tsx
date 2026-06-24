import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type Tab = 'signin' | 'signup' | 'forgot';
type Mode = 'password' | 'magic';

export default function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('signin');
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // When sign-in fails with "Invalid login credentials" we can't know whether
  // the account exists with a different method or the password is just wrong.
  // We surface both options as hints rather than guess.
  const [hintForgot, setHintForgot] = useState(false);

  // If a session already exists (e.g. the magic-link redirect landed here),
  // bounce straight to the feed.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate('/', { replace: true });
    })();
  }, [navigate]);

  function switchTab(next: Tab) {
    setTab(next);
    setErr(null);
    setInfo(null);
    setHintForgot(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setHintForgot(false);
    setBusy(true);
    try {
      if (tab === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/auth/reset',
        });
        if (error) throw error;
        // Anti-enumeration: don't say whether the email exists.
        setInfo(
          `If an account exists for ${email}, we sent a password reset link. Check your inbox.`,
        );
        return;
      }

      if (mode === 'magic') {
        // Sign In + magic → only allow if the account exists. Sign Up + magic
        // → allow creating one. This makes the "wrong method" experience
        // explicit instead of silently no-opping.
        const shouldCreateUser = tab === 'signup';
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser,
            emailRedirectTo: window.location.origin + '/',
          },
        });
        if (error) {
          if (/signups not allowed|user not found/i.test(error.message)) {
            setErr("No account found for that email. Use Sign Up instead.");
            return;
          }
          throw error;
        }
        setInfo(
          tab === 'signup'
            ? `Account ready. Check ${email} for your sign-in link.`
            : `Magic link sent to ${email}. Check your inbox.`,
        );
        return;
      }

      if (tab === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (/invalid login credentials/i.test(error.message)) {
            setErr(
              "That email and password didn't match. If you signed up with a magic link, this account has no password — reset it below or use magic link.",
            );
            setHintForgot(true);
            return;
          }
          if (/email not confirmed/i.test(error.message)) {
            setErr(
              'Your email isn\'t confirmed yet. Check your inbox for the confirmation link, or sign in with magic link.',
            );
            return;
          }
          throw error;
        }
        navigate('/', { replace: true });
        return;
      }

      // tab === 'signup' with password
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + '/' },
      });
      if (error) throw error;

      // Supabase anti-enumeration: a repeated signup returns 200 with an
      // empty `identities` array on the user object. Detect that and show a
      // clear error rather than letting the user wait for an email that will
      // never arrive.
      const identities = data?.user?.identities ?? [];
      if (data?.user && identities.length === 0) {
        setErr(
          "This email is already registered. Sign in below, or use Forgot password to set a new one.",
        );
        setHintForgot(true);
        return;
      }

      // Real new user. Session present when "Confirm email" is disabled.
      if (data.session) {
        navigate('/', { replace: true });
      } else {
        setInfo(`Account created. We sent a confirmation link to ${email}.`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const passwordMin = 6;
  const submitLabel =
    tab === 'forgot'
      ? 'Send reset link'
      : mode === 'magic'
        ? tab === 'signup'
          ? 'Send sign-up link'
          : 'Send sign-in link'
        : tab === 'signin'
          ? 'Sign in'
          : 'Create account';
  const disabled =
    busy ||
    !email ||
    (tab !== 'forgot' && mode === 'password' && password.length < passwordMin);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">NeuroFeed</h1>
        <p className="mt-1 text-sm text-muted">
          Study-focused social learning. Your material, as a feed.
        </p>
      </div>

      {tab !== 'forgot' ? (
        <div className="mb-4 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-sm font-semibold">
          <TabBtn active={tab === 'signin'} onClick={() => switchTab('signin')}>Sign in</TabBtn>
          <TabBtn active={tab === 'signup'} onClick={() => switchTab('signup')}>Sign up</TabBtn>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => switchTab('signin')}
          className="mb-4 text-left text-xs text-white/65 hover:text-white"
        >
          ← Back to sign in
        </button>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@email.com"
        />

        {tab !== 'forgot' && mode === 'password' && (
          <Field
            label="Password"
            type="password"
            required
            minLength={passwordMin}
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={setPassword}
            placeholder={tab === 'signup' ? `At least ${passwordMin} characters` : '••••••••'}
          />
        )}

        {tab === 'signin' && mode === 'password' && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => switchTab('forgot')}
              className="text-xs text-white/65 hover:text-white"
            >
              Forgot password?
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Working…' : submitLabel}
        </button>

        {tab !== 'forgot' && (
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'password' ? 'magic' : 'password'));
              setErr(null);
              setInfo(null);
              setHintForgot(false);
            }}
            className="w-full text-center text-xs text-white/65 hover:text-white"
          >
            {mode === 'password'
              ? 'Use a magic link instead'
              : 'Use email + password instead'}
          </button>
        )}

        {err && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-sm text-rose-200">
            {err}
          </p>
        )}
        {hintForgot && tab === 'signin' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/75">
            <span>Try one of:</span>
            <button
              type="button"
              onClick={() => switchTab('forgot')}
              className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-white hover:bg-accent/25"
            >
              Reset password
            </button>
            <button
              type="button"
              onClick={() => { setMode('magic'); setErr(null); setHintForgot(false); }}
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white hover:bg-white/10"
            >
              Use magic link
            </button>
          </div>
        )}
        {hintForgot && tab === 'signup' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/75">
            <span>Already have an account?</span>
            <button
              type="button"
              onClick={() => switchTab('signin')}
              className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-white hover:bg-accent/25"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchTab('forgot')}
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white hover:bg-white/10"
            >
              Forgot password
            </button>
          </div>
        )}
        {info && (
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 text-sm text-emerald-100">
            {info}
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-[11px] text-white/45">
        By continuing you agree that NeuroFeed processes your uploaded documents to generate study material.
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl py-2 transition-colors ${
        active ? 'bg-accent text-white shadow' : 'text-white/65 hover:text-white'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
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
