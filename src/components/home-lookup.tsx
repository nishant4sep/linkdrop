'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PublicLinkCard } from '@/components/public-link-card';
import { SubmitPublic } from '@/components/submit-public';
import { SponsorGate, gateCooldownActive } from '@/components/sponsor-gate';

type Resource = { id: string; url: string; type: string; description: string | null; addedAt: string | null };

/**
 * The interactive half of the public home page: paste a post URL, see what is
 * already shared, and (on a miss) publish anonymously or from your account.
 * The "find" action passes through the sponsored interstitial (cooldown-free
 * in testing; real visitors meet it at most once per COOLDOWN_MS).
 */
export function HomeLookup() {
  const [url, setUrl] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [postCode, setPostCode] = useState('');
  const [resources, setResources] = useState<Resource[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [searched, setSearched] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const pendingUrl = useRef<string | null>(null);

  async function resolve(e: FormEvent) {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;

    // Sponsored interstitial — but not for every single repeat search.
    if (gateCooldownActive()) {
      void runLookup(target);
      return;
    }
    pendingUrl.current = target;
    setGateOpen(true);
  }

  function proceedFromGate() {
    setGateOpen(false);
    const target = pendingUrl.current;
    pendingUrl.current = null;
    if (target) void runLookup(target);
  }

  async function runLookup(target: string) {
    setChecking(true);
    setError('');
    setMessage('');
    setResources([]);
    setSearched(false);
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not check that link.');
      setCanonicalUrl(data.postUrl);
      setPostCode(data.postCode ?? '');
      setResources(data.resources ?? []);
      setMessage(data.message);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setChecking(false);
    }
  }

  // Scroll the results into view once a lookup completes.
  useEffect(() => {
    if (searched) {
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searched, resources.length]);

  const hasResults = resources.length > 0;

  return (
    <div className="mx-auto mt-12 w-[min(680px,100%)]">
      <SponsorGate open={gateOpen} onDone={proceedFromGate} />
      <form onSubmit={resolve}>
        <label htmlFor="post" className="mb-2 block text-xs font-bold text-linkdrop-ink">
          Instagram post or Reel URL
        </label>
        <div className="flex flex-col gap-2.5 rounded-2xl border border-linkdrop-line bg-white p-2.5 shadow-soft sm:flex-row sm:items-center">
          <input
            id="post"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            required
            maxLength={2048}
            className="min-w-0 flex-1 rounded-xl px-4 py-3 text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            disabled={checking}
            className="rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Find resource ↗'}
          </button>
        </div>
      </form>
      <p className="mt-3 text-center text-xs text-neutral-500">
        Community-shared links, no sign-up, instant publishing. Bad link? One tap reports it.
      </p>

      {/* Results */}
      <div id="results" className="scroll-mt-24">
        <div className="mt-6 space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">
              {error}
            </div>
          )}
          {message && searched && (
            <div role="status" className="flex flex-col gap-2 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">
              <span>{message}</span>
              {postCode && (
                <Link href={`/r/${postCode}`} className="text-xs font-bold text-linkdrop-forest underline underline-offset-2">
                  Open this post&apos;s permanent page — share it so Google can index it too →
                </Link>
              )}
            </div>
          )}
          {hasResults && (
            <div className="space-y-3 pt-2">
              {resources.map((r) => (
                <PublicLinkCard key={r.id} resource={r} />
              ))}
            </div>
          )}
        </div>
        {searched && !hasResults && canonicalUrl && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
              <p className="font-semibold">Nothing matched yet</p>
              <p className="mt-1 text-sm text-linkdrop-muted">Have the link from the creator&apos;s DM? Add it below — 20 seconds, live instantly for the next person.</p>
            </div>
            <div id="contribute">
              <SubmitPublic canonicalUrl={canonicalUrl} postCode={postCode} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
