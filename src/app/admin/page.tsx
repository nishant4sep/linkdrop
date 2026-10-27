'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { ModerationQueue } from '@/components/console/moderation-queue';
import { PayoutQueue } from '@/components/console/payout-queue';
import { ContributorTable } from '@/components/console/contributor-table';
import { ReportedQueue } from '@/components/console/reported-queue';
import { PromotionQueue } from '@/components/console/promotion-queue';
import { OverviewTab } from '@/components/console/overview-tab';

// The console's working tabs today: Overview, Reports and Promotions. The
// account-era queues stay live code but render as dormant until then.
const ACTIVE_TABS = ['overview', 'reports', 'promotions'] as const;
const DORMANT_TABS = ['moderation', 'contributors', 'payouts'] as const;
const TABS = [...ACTIVE_TABS, ...DORMANT_TABS] as const;

export default function AdminPage() {
  const router = useRouter();
  const { session, loading } = useLinkDropSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview');

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Checking access…</main>;
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper px-5">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Administrator sign-in required</h1>
          <p className="mt-2 text-sm text-linkdrop-muted">Only allowlisted administrators can open this console.</p>
          <Link className="mt-5 inline-block rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410] transition hover:brightness-95" href="/login">Sign in →</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      <main className="mx-auto w-[min(1000px,calc(100%-40px))] py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-linkdrop-line pb-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">
              linkdrop<span className="text-linkdrop-forest">.</span> owner console
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Manage LinkDrop</h1>
            <p className="mt-1 text-sm text-linkdrop-muted">Overview monitors everything; Reports is your daily queue; Promotions approves leaderboard winners&apos; ads (top 3 with 5+ live links). Dormant tabs are the pre-pivot queues.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={signOut} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50">Sign out</button>
          </div>
        </header>

        <div className="mt-7 inline-flex rounded-xl bg-neutral-100 p-1">
          {TABS.map((value) => {
            const dormant = (DORMANT_TABS as readonly string[]).includes(value);
            return (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${tab === value ? 'bg-white text-linkdrop-ink shadow-sm' : 'text-linkdrop-muted hover:text-linkdrop-ink'}`}
              >
                {value}
                {dormant && <span className="ml-1.5 text-[10px] font-bold uppercase text-neutral-400">dormant</span>}
              </button>
            );
          })}
        </div>

        <section className="mt-8">
          {tab === 'overview' && <OverviewTab onOpenTab={setTab} />}
          {tab === 'moderation' && <ModerationQueue />}
          {tab === 'reports' && <ReportedQueue />}
          {tab === 'promotions' && <PromotionQueue />}
          {tab === 'contributors' && <ContributorTable />}
          {tab === 'payouts' && <PayoutQueue />}
        </section>
      </main>
    </div>
  );
}
