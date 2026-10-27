'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLinkDropSession } from '@/components/use-linkdrop-session';

type PromoRow = {
  id: string;
  userId: string;
  username: string;
  rank: { rank: number | null; liveLinks: number; eligible: boolean } | null;
  headline: string;
  detail: string | null;
  targetUrl: string;
  status: string;
  ownerNote: string | null;
  activeUntil: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type QueuePayload = {
  ok?: boolean;
  error?: string;
  pending?: PromoRow[];
  approved?: PromoRow[];
  history?: PromoRow[];
};

function promoCard(row: PromoRow): string {
  return `${row.username} · "${row.headline.replace(/"/g, '')}" · ${row.rank ? `#${row.rank.rank ?? '—'} with ${row.rank.liveLinks} live` : 'unranked'}`;
}

/**
 * Owner review of leaderboard-winners' promotion requests. Approve gives the
 * request a 24h live window AND the slot only renders while the contributor
 * is still inside the top of the live leaderboard.
 */
export function PromotionQueue() {
  const { session } = useLinkDropSession();
  const [pending, setPending] = useState<PromoRow[]>([]);
  const [approved, setApproved] = useState<PromoRow[]>([]);
  const [history, setHistory] = useState<PromoRow[]>([]);
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
      const response = await fetch('/api/admin/promotions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as QueuePayload;
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Owner access required: sign in at /login with the account listed in admin_users, then reopen this tab.'
            : payload.error ?? 'Could not load the promotion queue.',
        );
      }
      setPending(payload.pending ?? []);
      setApproved(payload.approved ?? []);
      setHistory(payload.history ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the promotion queue.');
    } finally {
      setLoadingItems(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) void loadItems();
  }, [session?.access_token, loadItems]);

  async function decide(row: PromoRow, action: 'approve' | 'reject' | 'retire' | 'extend') {
    if (!session?.access_token) return;
    const note = (notes[row.id] ?? '').trim();
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/promotions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: row.id, action, note, hours: 24 }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Decision could not be saved.');
      setNotice(`Promotion ${action} saved: ${promoCard(row)}`);
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision could not be saved.');
    } finally {
      setBusyId('');
    }
  }

  const renderRow = (row: PromoRow, actions: Array<{ action: 'approve' | 'reject' | 'retire' | 'extend'; label: string; danger?: boolean }>, liveBadge?: string) => (
    <article key={row.id} className="rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {liveBadge && (
            <span className="inline-flex items-center rounded-full bg-[#eaf4df] px-2.5 py-1 text-[11px] font-bold text-linkdrop-forest ring-1 ring-[#cbe3a8]">{liveBadge}</span>
          )}
          <p className="mt-2 text-sm font-extrabold">From @{row.username} — {row.rank ? `#${row.rank.rank ?? '—'} · ${row.rank.liveLinks} live links · ${row.rank.eligible ? 'eligible' : 'NO LONGER on top'}` : 'unranked'}</p>
          <p className="mt-2 text-sm font-semibold">{row.headline}</p>
          {row.detail && <p className="text-xs text-linkdrop-muted">{row.detail}</p>}
          <a className="mt-1 block break-all text-xs text-linkdrop-forest underline underline-offset-2" href={row.targetUrl} target="_blank" rel="noreferrer">{row.targetUrl}</a>
          {row.ownerNote && <p className="mt-1 text-[11px] text-linkdrop-muted">Note: {row.ownerNote}</p>}
        </div>
        <p className="text-xs text-linkdrop-muted">Requested {new Date(row.createdAt).toLocaleString()}</p>
      </div>

      <label className="mt-4 block text-xs font-bold">
        Decision note <span className="font-medium text-neutral-400">(saved to the audit trail)</span>
      </label>
      <input
        value={notes[row.id] ?? ''}
        onChange={(event) => setNotes((old) => ({ ...old, [row.id]: event.target.value }))}
        maxLength={500}
        className="mt-2 w-full rounded-xl border border-linkdrop-line bg-white px-4 py-2.5 text-sm outline-none transition focus:border-linkdrop-forest"
        placeholder="Checked the ad link — fine / violates guidelines…"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map(({ action, label, danger }) => (
          <button
            key={action}
            disabled={busyId === row.id}
            onClick={() => void decide(row, action)}
            className={`rounded-xl px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              danger
                ? 'bg-[#fff0ee] text-[#923b36] ring-1 ring-[#f3d1cc] hover:bg-[#ffe4e0]'
                : 'bg-linkdrop-lime text-[#1a2410] hover:brightness-95'
            }`}
          >
            {busyId === row.id ? 'Saving…' : label}
          </button>
        ))}
      </div>
    </article>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-linkdrop-muted">
          {pending.length} pending · {approved.length} live — the slot auto-expires after the approved window and only renders while the winner stays on top
        </p>
        <button onClick={() => void loadItems()} disabled={loadingItems} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50 disabled:opacity-50">Refresh</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}

      <div className="mt-5 space-y-4">
        {!loadingItems && pending.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <p className="font-semibold">No promotion requests</p>
            <p className="mt-1 text-sm text-linkdrop-muted">Top contributors (top 3 with 5+ live links) can paste their own ad here for your approval.</p>
          </div>
        )}
        {pending.map((row) => renderRow(row, [
          { action: 'approve', label: 'Approve · live 24h', danger: false },
          { action: 'reject', label: 'Reject', danger: true },
        ]))}
        {approved.map((row) => renderRow(row, [
          { action: 'extend', label: 'Extend · next 24h', danger: false },
          { action: 'retire', label: 'Retire now', danger: true },
        ], row.activeUntil && new Date(row.activeUntil) > new Date()
          ? `LIVE until ${new Date(row.activeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${new Date(row.activeUntil).toDateString() !== new Date().toDateString() ? ' tomorrow' : ''}`
          : 'Window passed — reassess before extending'))}
        {history.length > 0 && (
          <section className="pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">History</p>
            <div className="mt-3 space-y-2">
              {history.map((row) => (
                <p key={row.id} className="rounded-xl bg-white px-4 py-3 text-xs text-linkdrop-muted ring-1 ring-linkdrop-line">
                  <span className="font-bold capitalize">{row.status}</span> · {promoCard(row)}
                  {row.ownerNote && <> · {row.ownerNote}</>}
                </p>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
