'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLinkDropSession } from '@/components/use-linkdrop-session';

type OverviewPayload = {
  ok?: boolean;
  error?: string;
  metrics?: {
    activeResources: number | null;
    postsCovered: number | null;
    lastAddedAt: string | null;
    attributedLiveResources: number | null;
    hiddenResources: number | null;
    pendingPromos: number | null;
    approvedPromos: number | null;
    reportsLast24h: number | null;
    leaderboardTop: Array<{ position: number; username: string; liveLinks: number }> | null;
  };
};

type TabName = 'overview' | 'reports' | 'promotions' | 'moderation' | 'contributors' | 'payouts';

type TileProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'plain' | 'warn' | 'good';
  tab?: TabName;
  onOpenTab?: (tab: TabName) => void;
};

function Tile({ label, value, hint, tone = 'plain', tab, onOpenTab }: TileProps) {
  const jump = tab && onOpenTab ? () => onOpenTab(tab) : undefined;
  return (
    <button
      type="button"
      onClick={jump}
      disabled={!jump}
      className={`rounded-2xl border border-linkdrop-line bg-white p-5 text-left shadow-soft ${jump ? 'transition hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'} ${
        tone === 'warn' && value !== '0' && value !== '—' ? 'ring-1 ring-amber-200' : tone === 'good' ? 'ring-1 ring-[#cbe3a8]' : ''
      }`}
    >
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p>}
      {jump && <p className="mt-1 text-[11px] font-bold text-linkdrop-forest">Open {tab} →</p>}
    </button>
  );
}

/**
 * The owner dashboard's command center: everything that moves on LinkDrop in
 * one screen — directory health, the promo pipeline, and report volume.
 * Clickable tiles jump straight into the relevant queue.
 */
export function OverviewTab({ onOpenTab }: { onOpenTab: (tab: TabName) => void }) {
  const { session } = useLinkDropSession();
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingData(true);
    setError('');
    try {
      const response = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const body = await response.json() as OverviewPayload;
      if (!response.ok) throw new Error(body.error ?? 'Could not load the overview.');
      setPayload(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the overview.');
    } finally {
      setLoadingData(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) void load();
  }, [session?.access_token, load]);

  const metrics = payload?.metrics;
  const top = metrics?.leaderboardTop ?? null;
  const n = (value: number | null | undefined) => (typeof value === 'number' ? value.toLocaleString('en-US') : '—');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-linkdrop-muted">
          Everything running LinkDrop right now — numbers are live queries, never cached fakes.
        </p>
        <button onClick={() => void load()} disabled={loadingData} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50 disabled:opacity-50">
          {loadingData ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Resources live" value={n(metrics?.activeResources)} hint={metrics?.lastAddedAt ? `last added ${new Date(metrics.lastAddedAt).toLocaleString()}` : undefined} />
        <Tile label="Posts covered" value={n(metrics?.postsCovered)} hint="indexable landing pages" />
        <Tile label="Attributed links" value={n(metrics?.attributedLiveResources)} hint="live link(s) credited to an account" />

        <Tile label="Hidden resources" value={n(metrics?.hiddenResources)} tone="warn" hint="disputed — awaiting your reinstate/remove" tab="reports" onOpenTab={onOpenTab} />
        <Tile label="Reports · 24h" value={n(metrics?.reportsLast24h)} hint="visitors filing reports yesterday→now" tab="reports" onOpenTab={onOpenTab} />
        <Tile label="Promo queue" value={`${n(metrics?.pendingPromos)} pending · ${n(metrics?.approvedPromos)} live`} tone="good" hint="leaderboard winners' ads" tab="promotions" onOpenTab={onOpenTab} />
      </div>

      <section className="mt-8 rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Podium right now</p>
        {top && top.length > 0 ? (
          <ol className="mt-4 space-y-2">
            {top.map((row) => (
              <li key={row.position} className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-2.5">
                <p className="text-sm font-extrabold">@{row.username}</p>
                <p className="text-xs font-bold text-linkdrop-muted">#{row.position} · {row.liveLinks} live links</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-linkdrop-muted">
            No ranked contributors yet — or the leaderboard is waiting for migration 0008 to be re-applied.{' '}
            <Link href="/leaderboard" target="_blank" className="font-bold text-linkdrop-forest underline underline-offset-2">Public board ↗</Link>
          </p>
        )}
      </section>

      <p className="mt-6 text-[11px] leading-relaxed text-neutral-500">
        Placement control: the search gate, home hero slot, and landing-page strip all pull the single approved promotion — you approve, retire, or extend it once, and every surface follows automatically. Nothing is ever auto-renewed past its window.
      </p>
    </div>
  );
}
