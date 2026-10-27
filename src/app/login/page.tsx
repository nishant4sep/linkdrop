'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useLinkDropSession } from '@/components/use-linkdrop-session';

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useLinkDropSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Redirect after session is restored. Must run in an effect, not during render,
  // to avoid triggering navigation while React is rendering the login form.
  useEffect(() => {
    if (!loading && session) {
      void router.replace('/dashboard');
    }
  }, [session, loading, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const client = supabaseBrowser();
      if (mode === 'signin') {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        void router.replace('/dashboard');
      } else {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` }
        });
        if (authError) throw authError;
        if (data.session) {
          void router.replace('/dashboard');
        } else {
          setMessage('Account created. Check your email to confirm the account, then sign in.');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Loading your session…</main>;
  if (session) return <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Opening your dashboard…</main>;

  return (
    <main className="min-h-screen bg-linkdrop-paper px-5 py-16 text-linkdrop-ink">
      <div className="mx-auto max-w-md">
        <Link href="/" className="text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink">← LinkDrop home</Link>
        <div className="mt-6 mb-10 text-center">
          <Link href="/" className="text-[22px] font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
        </div>
        <div className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <h1 className="text-3xl font-extrabold tracking-tight">{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p className="mt-2 text-sm leading-6 text-linkdrop-muted">
            Find verified resources or help build the resource index. Submitted links stay private until approved.
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
            <button type="button" onClick={() => { setMode('signin'); setError(''); setMessage(''); }} className={`rounded-lg px-3 py-2.5 transition-colors ${mode === 'signin' ? 'bg-white shadow-sm text-linkdrop-ink' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}>Sign in</button>
            <button type="button" onClick={() => { setMode('signup'); setError(''); setMessage(''); }} className={`rounded-lg px-3 py-2.5 transition-colors ${mode === 'signup' ? 'bg-white shadow-sm text-linkdrop-ink' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}>Create account</button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Email</span>
              <input className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Password</span>
              <input className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
            {message && <p role="status" className="rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{message}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-linkdrop-lime px-4 py-3.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-neutral-500">Use a unique password. LinkDrop staff will never ask you to send them your password or access token.</p>
        </div>
      </div>
    </main>
  );
}
