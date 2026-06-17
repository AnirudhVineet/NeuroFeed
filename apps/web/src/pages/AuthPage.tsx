import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/' },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted">We sent a magic link to {email}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="p-8 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="text-muted">We'll email you a magic link.</p>
      <input
        type="email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full bg-white/5 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-accent/40"
      />
      <button
        disabled={busy || !email}
        className="w-full rounded-xl bg-accent py-3 font-semibold disabled:opacity-40"
      >
        {busy ? 'Sending…' : 'Send magic link'}
      </button>
      {err && <p className="text-red-400 text-sm">{err}</p>}
    </form>
  );
}
