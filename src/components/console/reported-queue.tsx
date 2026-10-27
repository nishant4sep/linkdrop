'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import type { ApiError, ReportedItem } from './types';

type ApiPayload = ApiError & { reports?: ReportedItem[] };

const REASON_LABELS: Record<string, string> = {
  fraud: 'Scam / fraud',
  dead_link: 'Link does not work',
  explicit: 'Inappropriate content',
  copyright: 'Copyright claim',
  other: 'Other',
};

/**
 * Owner review of quarantined resources. Every resource here was auto-hidden
 * the moment a distinct visitor reported it. Reinstate returns it live;
 * Remove permanently delists it. IP hashes are shown for cross-checking.
 */
export function ReportedQueue() {
  const { session } = useLinkDropSession();
  const [items, setItems] = useState<ReportedItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadItems = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingItems(true);
    setError('');
    try {
      const response = await fetch('/api/admin/reports', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load the reports queue.');
      setItems(payload.reports ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the reports queue.');
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) void loadItems();
  }, [session?.access_token, loadItems]);

  async function decide(item: ReportedItem, action: 'reinstate' | 'remove') {
    if (!session?.access_token) return;
    const note = (notes[item.resourceId] ?? '').trim();

    if (action === 'remove') {
      const confirmation = window.confirm('Permanently remove this resource? It disappears from the directory.');
      if (!confirmation) return;
    }

    setBusyId(item.resourceId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ resourceId: item.resourceId, action, note })
      });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error ?? 'Decision could not be saved.');
      setNotice(action === 'reinstate' ? 'Resource reinstated and live again.' : 'Resource permanently removed.');
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision could not be saved.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-linkdrop-muted">{items.length} hidden resource{items.length === 1 ? '' : 's'} awaiting your decision</p>
        <button onClick={() => void loadItems()} disabled={loadingItems} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50 disabled:opacity-50">Refresh</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}

      <div className="mt-5 space-y-4">
        {!loadingItems && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <p className="font-semibold">No reported links right now</p>
            <p className="mt-1 text-sm text-linkdrop-muted">Resources return here the moment a visitor files a report.</p>
          </div>
        )}
        {items.map((item) => (
          <article key={item.resourceId} className="rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">Hidden · {item.reports.length} report{item.reports.length === 1 ? '' : 's'}</span>
                <p className="mt-3 text-sm font-semibold">{item.description || item.resourceType}</p>
                <a className="mt-0.5 block break-all text-xs text-linkdrop-forest underline underline-offset-2" href={item.resourceUrl} target="_blank" rel="noreferrer">{item.resourceUrl}</a>
                {item.postUrl && (
                  <a className="mt-1 inline-block text-xs text-linkdrop-muted underline underline-offset-2" href={item.postUrl} target="_blank" rel="noreferrer">Instagram post ↗</a>
                )}
                <p className="mt-1 text-[11px] text-linkdrop-muted">Submitter fingerprint: {item.submitterIpHash ? `${item.submitterIpHash.slice(0, 12)}…` : 'not recorded'}</p>
              </div>
              <p className="text-xs text-linkdrop-muted">Added {new Date(item.reportedAt).toLocaleString()}</p>
            </div>

            <div className="mt-4 border-t border-linkdrop-line pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Report details</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {item.reports.length === 0 && <li className="text-xs text-linkdrop-muted">No stored report rows for this resource.</li>}
                {item.reports.map((r, index) => (
                  <li key={index} className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold">{REASON_LABELS[r.reason] ?? r.reason}</span>
                    <span className="text-xs text-linkdrop-muted">{new Date(r.created_at).toLocaleString()}</span>
                    {r.details && <span className="text-xs">— {r.details}</span>}
                  </li>
                ))}
              </ul>

              <label className="mt-4 block text-xs font-bold">
                Decision note <span className="font-medium text-neutral-400">(saved to the audit trail)</span>
              </label>
              <input
                value={notes[item.resourceId] ?? ''}
                onChange={(event) => setNotes((old) => ({ ...old, [item.resourceId]: event.target.value }))}
                maxLength={500}
                className="mt-2 w-full rounded-xl border border-linkdrop-line bg-white px-4 py-2.5 text-sm outline-none transition focus:border-linkdrop-forest"
                placeholder="Checked the destination — looks legit / scam confirmed…"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busyId === item.resourceId} onClick={() => void decide(item, 'reinstate')} className="rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
                  {busyId === item.resourceId ? 'Saving…' : 'Reinstate'}
                </button>
                <button disabled={busyId === item.resourceId} onClick={() => void decide(item, 'remove')} className="rounded-xl bg-[#fff0ee] px-5 py-2.5 text-sm font-bold text-[#923b36] ring-1 ring-[#f3d1cc] transition hover:bg-[#ffe4e0] disabled:cursor-not-allowed disabled:opacity-60">
                  Remove permanently
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-10 text-xs leading-relaxed text-linkdrop-muted">A single report hides the resource instantly but never bans anyone. IP enforcement stays a human decision here — shared networks (carrier NAT) can band legitimate visitors together.</p>
    </div>
  );
}
