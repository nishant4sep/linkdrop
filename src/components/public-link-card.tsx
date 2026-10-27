'use client';

import { useState } from 'react';
import { hostOf, TYPE_LABELS } from './public-shared';

type Resource = { id: string; url: string; type: string; description: string | null; addedAt: string | null };

const REASONS = [
  { value: 'fraud', label: 'Scam / fraud' },
  { value: 'dead_link', label: 'Link does not work' },
  { value: 'explicit', label: 'Inappropriate content' },
  { value: 'copyright', label: 'Copyright / not mine' },
  { value: 'other', label: 'Something else' },
];

/**
 * A published resource card with the self-serve report flow. One report from a
 * distinct visitor quarantines the resource; the owner reviews from console.
 */
export function PublicLinkCard({ resource }: { resource: Resource }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState('');

  async function sendReport() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId: resource.id, reason, details, company: '' }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Could not send the report.');
      setOutcome(payload.message ?? 'Report received. Thank you.');
      setReporting(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {resource.type && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
            {TYPE_LABELS.get(resource.type) ?? resource.type}
          </span>
        )}
        <button
          onClick={() => setReporting((v) => !v)}
          className="text-xs font-semibold text-[#923b36] underline underline-offset-2 transition-colors hover:text-[#6d241f]"
        >
          Report this link
        </button>
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-tight">
        {resource.description || TYPE_LABELS.get(resource.type) || 'Shared resource'}
      </h3>
      <p className="mt-1 text-xs text-linkdrop-muted">{hostOf(resource.url)}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded-xl bg-linkdrop-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Open resource ↗
        </a>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
        External link — check the destination before downloading.
      </p>

      {reporting && !outcome && (
        <div className="mt-4 space-y-3 rounded-xl bg-[#fff8f7] p-4 ring-1 ring-[#f3d1cc]">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-[#e5b9b2] bg-white px-3 py-2 text-sm outline-none"
            defaultValue=""
          >
            <option value="" disabled>Why are you reporting this?</option>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            placeholder="Extra details (optional)"
            className="w-full rounded-lg border border-[#e5b9b2] bg-white px-3 py-2 text-sm outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              disabled={busy || !reason}
              onClick={() => void sendReport()}
              className="rounded-lg bg-[#923b36] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6d241f] disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send report'}
            </button>
            <button onClick={() => setReporting(false)} className="rounded-lg bg-white px-4 py-2 text-xs font-semibold ring-1 ring-[#e5b9b2]">
              Cancel
            </button>
          </div>
          {error && <p role="alert" className="text-xs text-[#923b36]">{error}</p>}
        </div>
      )}
      {outcome && <p role="status" className="mt-3 rounded-lg bg-[#edf5e4] px-3 py-2 text-xs text-[#4d5a3f]">{outcome}</p>}
    </article>
  );
}
