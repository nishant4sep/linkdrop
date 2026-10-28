'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useLinkDropSession } from '@/components/use-linkdrop-session';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';

type AuthResponse = {
  ok?: boolean;
  error?: string;
  action?: 'login' | 'signup';
  forceLogin?: boolean;
  message?: string;
  suggestions?: string[];
  session?: { access_token: string; refresh_token: string; expires_at: number };
};

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useLinkDropSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState(''); // honeypot: bots fill it, people never see it
  const [captchaToken, setCaptchaToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const widgetHost = useRef<HTMLDivElement | null>(null);

  // Adopt the session server-side sign-in produced, so the app treats this
  // visitor exactly like any other signed-in user afterwards.
  useEffect(() => {
    if (!loading && session) {
      void router.replace('/dashboard');
    }
  }, [session, loading, router]);

  // Optional Turnstile: rendered only when the owner configures a site key.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !widgetHost.current) return;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const turnstile = (window as unknown as { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void } }).turnstile;
      turnstile?.render(widgetHost.current as HTMLElement, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
      });
    };
    widgetHost.current.appendChild(script);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    setSuggestions([]);

    try {
      const response = await fetch('/api/auth/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode === 'signin' ? 'login' : 'signup',
          username: username.trim(),
          password,
          company, // honeypot — always empty for humans
          turnstileToken: captchaToken || undefined,
        }),
      });
      const payload = await response.json() as AuthResponse;
      if (!response.ok || !payload.ok) {
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 3) : []);
        throw new Error(payload.error ?? 'That did not work. Please retry.');
      }
      if (payload.forceLogin) {
        setMode('signin');
        setNotice(payload.message ?? 'Account created. Sign in now.');
        return;
      }
      if (payload.session) {
        const { error: adoptError } = await supabaseBrowser().auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        });
        if (adoptError) throw new Error('Signed in, but the session could not start. Please retry.');
        void router.replace('/dashboard');
        return;
      }
      throw new Error('Unexpected response. Please retry.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Loading your session…</main>;
  if (session) return <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Opening your account…</main>;

  const emailInField = mode === 'signin' && username.includes('@');

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
          <h1 className="text-3xl font-extrabold tracking-tight">{mode === 'signin' ? 'Welcome back.' : 'Claim your username.'}</h1>
          <p className="mt-2 text-sm leading-6 text-linkdrop-muted">
            {mode === 'signin'
              ? 'Sign in so every link you share is credited to you and ranked on the live leaderboard.'
              : 'No email. Just a username + password. Everything you share while signed in is listed under your name and climbs the live leaderboard.'}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
            <button type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); setSuggestions([]); }} className={`rounded-lg px-3 py-2.5 transition-colors ${mode === 'signin' ? 'bg-white shadow-sm text-linkdrop-ink' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}>Sign in</button>
            <button type="button" onClick={() => { setMode('signup'); setError(''); setNotice(''); setSuggestions([]); }} className={`rounded-lg px-3 py-2.5 transition-colors ${mode === 'signup' ? 'bg-white shadow-sm text-linkdrop-ink' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}>Create account</button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">{emailInField ? 'Email' : 'Username'}</span>
              <input
                className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
                type="text"
                inputMode={emailInField ? 'email' : 'text'}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
                maxLength={254}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={mode === 'signup' ? 'drop_king' : 'drop_king  (or your email for older accounts)'}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Password</span>
              <input className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} maxLength={200} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>

            {/* Honeypot: visually hidden. */}
            <div aria-hidden="true" className="absolute -left-[9999px]">
              <label htmlFor="auth-company">Company</label>
              <input id="auth-company" tabIndex={-1} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
            </div>

            <div ref={widgetHost} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />

            {error && <p role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
            {notice && <p role="status" className="rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}
            {suggestions.length > 0 && (
              <p className="text-xs text-linkdrop-muted">
                Available now:{' '}
                {suggestions.map((pick, index) => (
                  <span key={pick}>
                    {index > 0 && ' · '}
                    <button type="button" onClick={() => { setUsername(pick); setSuggestions([]); setError(''); }} className="font-bold text-linkdrop-forest underline underline-offset-2">
                      @{pick}
                    </button>
                  </span>
                ))}
              </p>
            )}

            <button disabled={busy} className="w-full rounded-xl bg-linkdrop-lime px-4 py-3.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create my account'}
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-neutral-500">
            No email, no spam — your username is your public identity. Use a unique password; LinkDrop will never ask for it.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-linkdrop-muted">
          Wondering why bother? <Link href="/leaderboard" className="font-bold text-linkdrop-forest underline underline-offset-2">Check the live leaderboard →</Link>
        </p>
      </div>
    </main>
  );
}
