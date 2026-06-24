import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// Auth flow on the new clinical light theme. UI rebuilt from the mockup
// designs (Auth/signin.html, signup.html, magiclink*.html). All the existing
// logic is preserved: session detection on mount, enumeration-resistant error
// messages, magic-link mode toggle, friendly forgot-password hints.

type Tab = 'signin' | 'signup' | 'forgot';
type Mode = 'password' | 'magic';

export default function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('signin');
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [hintForgot, setHintForgot] = useState(false);

  // Already-signed-in: bounce to feed. Handles the magic-link redirect too.
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

  function toggleMode() {
    setMode((m) => (m === 'password' ? 'magic' : 'password'));
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
        setInfo(
          `If an account exists for ${email}, we sent a password reset link. Check your inbox.`,
        );
        return;
      }

      if (mode === 'magic') {
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
            setErr('No account found for that email. Use Sign Up instead.');
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
              "Your email isn't confirmed yet. Check your inbox for the confirmation link, or sign in with magic link.",
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

      // Supabase anti-enumeration: a repeated signup returns 200 with an empty
      // identities[] on the user. Detect and surface a clear error instead of
      // letting the user wait for an email that will never arrive.
      const identities = data?.user?.identities ?? [];
      if (data?.user && identities.length === 0) {
        setErr(
          'This email is already registered. Sign in below, or use Forgot password to set a new one.',
        );
        setHintForgot(true);
        return;
      }

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
    <AuthShell
      title={
        tab === 'forgot'
          ? 'Reset your password'
          : mode === 'magic'
            ? tab === 'signup' ? 'Sign up with Magic Link' : 'Sign in with Magic Link'
            : null
      }
      subtitle={
        tab === 'forgot'
          ? "Enter your email and we'll send you a reset link."
          : mode === 'magic'
            ? "We'll send a secure login link to your inbox. No password required."
            : null
      }
    >
      {tab !== 'forgot' && (
        <div className="mb-md flex border-b border-outline-variant">
          <TabBtn active={tab === 'signin'} onClick={() => switchTab('signin')}>Sign In</TabBtn>
          <TabBtn active={tab === 'signup'} onClick={() => switchTab('signup')}>Sign Up</TabBtn>
        </div>
      )}

      {tab === 'forgot' && (
        <button
          type="button"
          onClick={() => switchTab('signin')}
          className="mb-md flex items-center gap-1 text-label-sm text-on-surface-variant transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          Back to sign in
        </button>
      )}

      <form onSubmit={submit} className="space-y-md">
        <IconField
          id="email"
          label="Email Address"
          icon="mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@gmail.com"
          required
        />

        {tab !== 'forgot' && mode === 'password' && (
          <div>
            <div className="mb-xs flex items-center justify-between">
              <label className="text-label-sm text-on-surface-variant" htmlFor="password">
                Password
              </label>
              {tab === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchTab('forgot')}
                  className="text-label-sm text-primary transition-all hover:underline"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <span
                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline"
                style={{ fontSize: '20px' }}
                aria-hidden
              >
                lock
              </span>
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                required
                minLength={passwordMin}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'signup' ? `At least ${passwordMin} characters` : '••••••••'}
                className="w-full rounded-lg border border-outline-variant bg-surface py-3 pl-10 pr-10 text-body-md text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-on-surface"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  {showPw ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {tab === 'signup' && (
              <p className="mt-xs text-[11px] text-outline">
                Must be at least {passwordMin} characters long.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-3 text-label-md font-bold text-on-primary-container shadow-sm transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '18px' }}>progress_activity</span>
              Working…
            </>
          ) : (
            <>
              {submitLabel}
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>arrow_forward</span>
            </>
          )}
        </button>

        {tab !== 'forgot' && (
          <>
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-outline-variant" />
              <span className="mx-4 flex-shrink text-label-sm uppercase tracking-wider text-outline">or</span>
              <div className="flex-grow border-t border-outline-variant" />
            </div>
            <button
              type="button"
              onClick={toggleMode}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-transparent py-3 text-label-md font-medium text-secondary transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
                {mode === 'password' ? 'auto_fix_high' : 'key'}
              </span>
              {mode === 'password'
                ? tab === 'signup' ? 'Sign up with Magic Link' : 'Sign in with Magic Link'
                : 'Use email + password instead'}
            </button>
          </>
        )}

        {err && <Banner kind="error">{err}</Banner>}
        {hintForgot && tab === 'signin' && (
          <HintChipRow label="Try one of:">
            <HintChip onClick={() => switchTab('forgot')}>Reset password</HintChip>
            <HintChip onClick={() => { setMode('magic'); setErr(null); setHintForgot(false); }}>
              Use magic link
            </HintChip>
          </HintChipRow>
        )}
        {hintForgot && tab === 'signup' && (
          <HintChipRow label="Already have an account?">
            <HintChip onClick={() => switchTab('signin')}>Sign in</HintChip>
            <HintChip onClick={() => switchTab('forgot')}>Forgot password</HintChip>
          </HintChipRow>
        )}
        {info && <Banner kind="success">{info}</Banner>}
      </form>

      <div className="mt-md border-t border-outline-variant pt-md">
        <p className="text-center text-[12px] leading-relaxed text-on-surface-variant">
          By continuing, you agree to NeuroFeed's{' '}
          <a className="text-primary hover:underline" href="#">Terms of Service</a> and{' '}
          <a className="text-primary hover:underline" href="#">Privacy Policy</a>.
        </p>
      </div>
    </AuthShell>
  );
}

// ---------- Shared shell ----------

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title?: string | null;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-gutter py-md">
      {/* Subtle background decoration — soft teal/navy blooms */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40">
        <div className="absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-primary-fixed blur-[120px]" />
        <div className="absolute -bottom-20 -left-20 h-[400px] w-[400px] rounded-full bg-tertiary-fixed blur-[120px]" />
      </div>

      <main className="w-full max-w-[440px]">
        <div className="mb-lg flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                psychology
              </span>
            </div>
            <h1 className="text-headline-md font-bold tracking-tight text-primary">NeuroFeed</h1>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Study-focused social learning. Your material, as a feed.
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-auth-card sm:p-lg">
          {(title || subtitle) && (
            <div className="mb-md text-center">
              {title && <h2 className="mb-1 text-headline-sm text-on-surface">{title}</h2>}
              {subtitle && <p className="text-body-sm text-on-surface-variant">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>

        <div className="mt-md text-center">
          <a
            href="mailto:support@neurofeed.app"
            className="inline-flex items-center justify-center gap-1 text-label-sm text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>help_outline</span>
            Need help with your account?
          </a>
        </div>
      </main>
    </div>
  );
}

// ---------- Small helpers ----------

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'flex-1 border-b-2 border-primary py-sm text-center text-label-md font-bold text-primary'
          : 'flex-1 border-b-2 border-transparent py-sm text-center text-label-md text-on-surface-variant transition-colors hover:text-primary'
      }
    >
      {children}
    </button>
  );
}

export function IconField({
  id,
  label,
  icon,
  value,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  icon: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>) {
  return (
    <div>
      <label className="mb-xs block text-label-sm text-on-surface-variant" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          style={{ fontSize: '20px' }}
          aria-hidden
        >
          {icon}
        </span>
        <input
          {...rest}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-outline-variant bg-surface py-3 pl-10 pr-4 text-body-md text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>
    </div>
  );
}

function Banner({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const cls =
    kind === 'error'
      ? 'rounded-lg border border-error/30 bg-error-container/40 p-3 text-body-sm text-on-error-container'
      : 'rounded-lg border border-primary/20 bg-secondary-container/40 p-3 text-body-sm text-on-secondary-container';
  return <p className={cls}>{children}</p>;
}

function HintChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-label-sm text-on-surface-variant">
      <span>{label}</span>
      {children}
    </div>
  );
}

function HintChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-primary/30 bg-primary-container/40 px-3 py-0.5 text-label-sm text-on-primary-container transition-colors hover:bg-primary-container/60"
    >
      {children}
    </button>
  );
}
