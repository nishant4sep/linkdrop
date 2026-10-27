'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RESOURCE_TYPE_OPTIONS } from './public-shared';

type Props = {
  /** Canonical Instagram post URL this resource belongs to. */
  canonicalUrl: string;
  /** Show an "open post page" hint after publishing (home page). */
  postCode?: string;
  /** Title inside the card. */
  compact?: boolean;
};

/**
 * Anonymous instant-publish form. No account required; publisher protection
 * is the one-report auto-hide plus rate limits handled server-side.
 */
export function SubmitPublic({ canonicalUrl, postCode, compact = false }: Props) {
  const router = useRouter();
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceType, setResourceType] = useState('other');
  const [description, setDescription] = useState('');
  const [company, setCompany] = useState(''); // honeypot: bots fill it, people never see it
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const response = await fetch('/api/public/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postUrl: canonicalUrl, resourceUrl, resourceType, description, company }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Could not publish that link.');
      setDone(payload.message ?? 'Published!');
      setResourceUrl('');
      setDescription('');
      if (postCode) router.refresh(); // landing page re-reads SSR data
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish that link.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-[#edf5e4] p-6 text-center ring-1 ring-[#cbe3a8]">
        <p className="font-bold text-[#3d5527]">✓ {done}</p>
        {!compact && postCode && (
          <a href={`/r/${postCode}`} className="mt-2 inline-block text-sm font-semibold text-linkdrop-forest underline underline-offset-2">
            Open the post&apos;s page →
          </a>
        )}
      </div>
    );
  }

  return (
    <form className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft" onSubmit={submit}>
      <p className="mb-5 break-all rounded-lg bg-neutral-50 px-3 py-2 text-xs text-linkdrop-muted">
        For <span className="font-semibold text-linkdrop-ink">{canonicalUrl}</span>
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor={`pub-resource-${compact ? 'c' : 'm'}`} className="mb-2 block text-xs font-bold">
            Resource URL (direct link / file / folder)
          </label>
          <input
            id={`pub-resource-${compact ? 'c' : 'm'}`}
            type="url"
            value={resourceUrl}
            onChange={(e) => setResourceUrl(e.target.value)}
            placeholder="https://drive.google.com/… or any https:// link"
            required
            maxLength={4096}
            className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
          />
        </div>
        <div>
          <label htmlFor={`pub-type-${compact ? 'c' : 'm'}`} className="mb-2 block text-xs font-bold">What is it?</label>
          <select
            id={`pub-type-${compact ? 'c' : 'm'}`}
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest"
          >
            {RESOURCE_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`pub-desc-${compact ? 'c' : 'm'}`} className="mb-2 block text-xs font-bold">
            Description <span className="font-medium text-neutral-400">(optional)</span>
          </label>
          <input
            id={`pub-desc-${compact ? 'c' : 'm'}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="e.g. Mobile lightroom presets for this reel"
            className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest"
          />
        </div>
      </div>

      {/* Honeypot: visually hidden. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label htmlFor="company">Company</label>
        <input id="company" tabIndex={-1} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
      </div>

      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          disabled={busy}
          className="rounded-xl bg-linkdrop-lime px-6 py-3.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Publishing…' : 'Publish it for everyone →'}
        </button>
        <small className="text-xs leading-relaxed text-neutral-500">
          No account needed. Goes live instantly; users can report bad links, and our team reviews every report.
        </small>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
    </form>
  );
}
