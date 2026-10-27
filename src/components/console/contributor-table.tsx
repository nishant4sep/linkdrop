'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import type { ApiError, ContributorItem } from './types';

type ApiPayload = ApiError & { contributors?: ContributorItem[] };

export function ContributorTable() {
  const { session } = useLinkDropSession();
  const [items, setItems] = useState<ContributorItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadItems = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingItems(true);
    setError('');
    try {
      const response = await fetch('/api/admin/contributors', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load contributors.');
      setItems(payload.contributors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load contributors.');
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) void loadItems();
  }, [session?.access_token, loadItems]);

  async function setStatus(item: ContributorItem, accountStatus: 'active' | 'suspended') {
    if (!session?.access_token) return;
    const confirmation = accountStatus === 'suspended'
      ? `Suspend ${item.email ?? item.displayName}? Submissions and payout requests will be blocked until reactivated.`
      : `Reactivate ${item.email ?? item.displayName}?`;
    if (!window.confirm(confirmation)) return;

    setBusyId(item.userId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/contributors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: item.userId, accountStatus })
      });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error ?? 'Status update failed.');
      setNotice(accountStatus === 'active' ? 'Contributor reactivated.' : 'Contributor suspended.');
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Status update failed.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-linkdrop-muted">{items.length} contributor{items.length === 1 ? '' : 's'} on record</p>
        <button onClick={() => void loadItems()} disabled={loadingItems} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50 disabled:opacity-50">{loadingItems ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}

      <div className="mt-5 overflow-hidden rounded-2xl border border-linkdrop-line bg-white shadow-soft">
        {!loadingItems && items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold">No contributors yet</p>
            <p className="mt-1 text-sm text-linkdrop-muted">New sign-ups appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-linkdrop-line bg-neutral-50 text-[11px] uppercase tracking-[0.1em] text-linkdrop-muted">
                  <th className="px-5 py-3 font-bold">Contributor</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Submissions</th>
                  <th className="px-5 py-3 font-bold">Approved</th>
                  <th className="px-5 py-3 font-bold">Balance</th>
                  <th className="px-5 py-3 font-bold">Held</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {items.map((item) => (
                  <tr key={item.userId}>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{item.displayName || 'Contributor'}</p>
                      <p className="text-xs text-linkdrop-muted">{item.email ?? item.userId.slice(0, 8)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${item.accountStatus === 'active' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-red-50 text-red-800 ring-1 ring-red-200'}`}>
                        {item.accountStatus}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold">{item.submissions}</td>
                    <td className="px-5 py-4 font-semibold">{item.approved}</td>
                    <td className="px-5 py-4 font-semibold">{item.availablePoints}</td>
                    <td className="px-5 py-4 font-semibold">{item.outstandingPoints}</td>
                    <td className="px-5 py-4">
                      {item.accountStatus === 'active' ? (
                        <button disabled={busyId === item.userId} onClick={() => void setStatus(item, 'suspended')} className="rounded-lg bg-[#fff0ee] px-3 py-1.5 text-xs font-bold text-[#923b36] ring-1 ring-[#f3d1cc] transition hover:bg-[#ffe4e0] disabled:opacity-50">Suspend</button>
                      ) : (
                        <button disabled={busyId === item.userId} onClick={() => void setStatus(item, 'active')} className="rounded-lg bg-linkdrop-lime px-3 py-1.5 text-xs font-bold text-[#1a2410] transition hover:brightness-95 disabled:opacity-50">Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-10 text-xs leading-relaxed text-linkdrop-muted">Suspending a contributor immediately blocks submissions, payout requests, and other API access until reactivated. Changes are audited.</p>
    </div>
  );
}
