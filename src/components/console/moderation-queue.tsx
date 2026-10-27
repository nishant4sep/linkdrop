'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import type { ModerationItem } from './types';

type ApiPayload = { error?: string; submissions?: ModerationItem[] };

const FILTERS = ['pending', 'approved', 'rejected'] as const;

export function ModerationQueue() {
  const { session } = useLinkDropSession();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [busyId, setBusyId] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadItems = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingItems(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/submissions?status=${encodeURIComponent(filter)}&limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load the moderation queue.');
      setItems(payload.submissions ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the moderation queue.');
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [session?.access_token, filter]);

  useEffect(() => {
    if (session?.access_token) void loadItems();
  }, [session?.access_token, loadItems]);

  async function review(item: ModerationItem, decision: 'approve' | 'reject') {
    if (!session?.access_token) return;
    const confirmation = decision === 'approve'
      ? 'Approve and publish this resource? It will become publicly visible and its contributor will earn points.'
      : 'Reject this submission? It will not be published.';
    if (!window.confirm(confirmation)) return;

    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ submissionId: item.id, decision, reviewNote: notes[item.id] ?? '' })
      });
      const payload = await response.json() as ApiPayload & { result?: { rewardAwarded?: boolean } };
      if (!response.ok) throw new Error(payload.error ?? 'Review could not be saved.');
      setNotice(decision === 'approve' ? 'Approved and published. Contributor reward posted.' : 'Submission rejected.');
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Review could not be saved.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-neutral-100 p-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors ${filter === value ? 'bg-white text-linkdrop-ink shadow-sm' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}
            >
              {value}
            </button>
          ))}
        </div>
        <button onClick={() => void loadItems()} disabled={loadingItems} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50 disabled:opacity-50">{loadingItems ? 'Loading…' : 'Refresh queue'}</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}

      <div className="mt-5 space-y-4">
        {!loadingItems && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <p className="font-semibold">Queue is empty</p>
            <p className="mt-1 text-sm text-linkdrop-muted">No {filter} submissions found.</p>
          </div>
        )}
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold capitalize">{item.status}</span>
                <p className="mt-3 text-xs text-linkdrop-muted">Submitted {new Date(item.created_at).toLocaleString()} · Contributor ID {item.submitted_by}</p>
              </div>
              <p className="text-xs text-linkdrop-muted">Submission {item.id}</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Instagram post ID</p>
                <p className="mt-1 break-all text-sm">{item.post_id}</p>
                {item.canonical_url
                  ? <a className="mt-1 inline-block text-xs text-linkdrop-forest underline underline-offset-2" href={item.canonical_url} target="_blank" rel="noreferrer">Open post ↗</a>
                  : <a className="mt-1 inline-block text-xs text-linkdrop-forest underline underline-offset-2" href={`https://www.instagram.com/p/${item.post_id}/`} target="_blank" rel="noreferrer">Open post ↗</a>}
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Resource type</p>
                <p className="mt-1 text-sm capitalize">{item.resource_type.replaceAll('_', ' ')}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Destination URL</p>
                <a className="mt-1 break-all text-sm font-medium underline underline-offset-4 decoration-linkdrop-line hover:decoration-linkdrop-forest" href={item.normalized_resource_url} target="_blank" rel="noreferrer">{item.normalized_resource_url}</a>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{item.description || 'No description provided.'}</p>
              </div>
            </div>
            {item.status === 'pending' && (
              <div className="mt-5 border-t border-linkdrop-line pt-4">
                <label className="block text-xs font-bold">Review note <span className="font-medium text-neutral-400">(saved in permanent review history)</span></label>
                <textarea value={notes[item.id] ?? ''} onChange={(event) => setNotes((old) => ({ ...old, [item.id]: event.target.value }))} maxLength={1000} rows={2} className="mt-2 w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60" placeholder="Evidence checked, issue found, or reason for decision…" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busyId === item.id} onClick={() => void review(item, 'approve')} className="rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">{busyId === item.id ? 'Saving…' : 'Approve and publish'}</button>
                  <button disabled={busyId === item.id} onClick={() => void review(item, 'reject')} className="rounded-xl bg-[#fff0ee] px-5 py-2.5 text-sm font-bold text-[#923b36] ring-1 ring-[#f3d1cc] transition hover:bg-[#ffe4e0] disabled:cursor-not-allowed disabled:opacity-60">Reject</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="mt-10 text-xs leading-relaxed text-linkdrop-muted">Reviewing a resource does not establish ownership or redistribution rights by itself. Check destination legitimacy, resource relevance, and any rights or takedown concerns before publishing.</p>
    </div>
  );
}
