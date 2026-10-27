'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import type { ApiError, PayoutItem } from './types';

type ApiPayload = ApiError & { payouts?: PayoutItem[] };

const SCOPES = ['active', 'settled'] as const;

const payoutStatusMeta: Record<string, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  under_review: { label: 'Under review', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  processing: { label: 'Payment in progress', className: 'bg-lime-50 text-lime-800 ring-1 ring-lime-300' },
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200' },
};

export function PayoutQueue() {
  const { session } = useLinkDropSession();
  const [items, setItems] = useState<PayoutItem[]>([]);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('active');
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});

  const loadItems = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingItems(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/payouts?scope=${scope}&limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load the payout queue.');
      setItems(payload.payouts ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the payout queue.');
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [session?.access_token, scope]);

  useEffect(() => {
    if (session?.access_token) void loadItems();
  }, [session?.access_token, loadItems]);

  async function decide(item: PayoutItem, decision: 'pay' | 'process' | 'reject') {
    if (!session?.access_token) return;
    const reason = reasons[item.id]?.trim() ?? '';
    const reference = references[item.id]?.trim() ?? '';

    if (decision === 'reject' && !reason) {
      setError('Record a rejection reason before rejecting.');
      return;
    }
    if (decision === 'pay') {
      const confirmation = window.confirm(
        `Mark ${item.amount} points as PAID OUT to ${item.contributorEmail ?? item.contributorName}?\n\nOnly do this after you have actually delivered the payment through your own channel. This posts an irreversible ledger entry.`
      );
      if (!confirmation) return;
    }
    if (decision === 'reject') {
      const confirmation = window.confirm('Reject this payout? The reserved points return to the contributor\'s balance.');
      if (!confirmation) return;
    }

    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/payouts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ redemptionId: item.id, decision, reason, payoutReference: reference })
      });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error ?? 'The decision could not be saved.');
      const label = decision === 'pay' ? 'Marked paid. Ledger updated.' : decision === 'process' ? 'Marked payment in progress.' : 'Payout rejected. Points returned to the contributor.';
      setNotice(label);
      setReferences((old) => ({ ...old, [item.id]: '' }));
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The decision could not be saved.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-neutral-100 p-1">
          {SCOPES.map((value) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors ${scope === value ? 'bg-white text-linkdrop-ink shadow-sm' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}
            >
              {value === 'active' ? 'In review' : 'History'}
            </button>
          ))}
        </div>
        <button onClick={() => void loadItems()} disabled={loadingItems} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50 disabled:opacity-50">{loadingItems ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}

      <div className="mt-5 space-y-4">
        {!loadingItems && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <p className="font-semibold">No {scope} payout requests</p>
            <p className="mt-1 text-sm text-linkdrop-muted">Payout requests from collectors land here.</p>
          </div>
        )}
        {items.map((item) => {
          const conf = payoutStatusMeta[item.status] ?? { label: item.status, className: 'bg-neutral-100 ring-1 ring-neutral-200' };
          const inFlight = ['requested', 'under_review', 'approved', 'processing'].includes(item.status);
          return (
            <article key={item.id} className="rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${conf.className}`}>{conf.label}</span>
                    <span className="text-xl font-extrabold">{item.amount} <span className="text-xs font-semibold text-linkdrop-muted">{item.unit}</span></span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    {item.contributorName}
                    {item.contributorEmail && <span className="font-normal text-linkdrop-muted"> · {item.contributorEmail}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-linkdrop-muted">
                    Requested {new Date(item.requested_at).toLocaleString()}
                    {item.contributorStatus !== 'active' && <> · account is <span className="font-semibold text-[#923b36]">{item.contributorStatus}</span></>}
                  </p>
                  {item.payout_reference && <p className="mt-0.5 text-xs text-linkdrop-muted">Reference: {item.payout_reference}</p>}
                  {item.decision_reason && <p className="mt-0.5 text-xs text-linkdrop-muted">Reviewer note: {item.decision_reason}</p>}
                </div>
                <p className="text-xs text-linkdrop-muted">#{item.id.slice(0, 8)}</p>
              </div>

              {inFlight && (
                <div className="mt-4 border-t border-linkdrop-line pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Payout reference <span className="font-medium normal-case text-neutral-400">(optional, e.g. tx id)</span></span>
                      <input
                        value={references[item.id] ?? ''}
                        onChange={(event) => setReferences((old) => ({ ...old, [item.id]: event.target.value }))}
                        maxLength={200}
                        className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-2.5 text-sm outline-none transition focus:border-linkdrop-forest"
                        placeholder="UPI id, transfer reference…"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-linkdrop-muted">Internal note</span>
                      <input
                        value={reasons[item.id] ?? ''}
                        onChange={(event) => setReasons((old) => ({ ...old, [item.id]: event.target.value }))}
                        maxLength={500}
                        className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-2.5 text-sm outline-none transition focus:border-linkdrop-forest"
                        placeholder="Reason shown to the contributor when rejecting"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={busyId === item.id} onClick={() => void decide(item, 'pay')} className="rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">{busyId === item.id ? 'Saving…' : 'Mark paid'}</button>
                    <button disabled={busyId === item.id} onClick={() => void decide(item, 'process')} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold ring-1 ring-linkdrop-line transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60">Mark in progress</button>
                    <button disabled={busyId === item.id} onClick={() => void decide(item, 'reject')} className="rounded-xl bg-[#fff0ee] px-5 py-2.5 text-sm font-bold text-[#923b36] ring-1 ring-[#f3d1cc] transition hover:bg-[#ffe4e0] disabled:cursor-not-allowed disabled:opacity-60">Reject</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="mt-10 text-xs leading-relaxed text-linkdrop-muted">Marking a payout as paid posts an irreversible ledger debit for the contributor. Rejecting returns the reserved points to their balance. All decisions are recorded with your admin ID.</p>
    </div>
  );
}
