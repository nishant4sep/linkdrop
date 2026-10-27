
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { EXPLANATION_LABELS, MIN_REDEMPTION_POINTS } from '@/lib/reward-math';

type Submission = {
  id: string;
  postUrl: string | null;
  resourceUrl: string;
  resourceType: string;
  description: string | null;
  status: string;
  createdAt: string;
};

type RewardEntry = { id: string; amount: number; entry_type: string; status: string; rule_version: string; explanation_code: string; created_at: string };

type PayoutRequest = {
  id: string;
  amount: number;
  status: string;
  payout_reference: string | null;
  decision_reason: string | null;
  requested_at: string;
  decided_at: string | null;
};

type Rewards = {
  availablePoints: number;
  pendingReviewPoints: number;
  paidOutPoints: number;
  outstandingPoints: number;
  ruleVersion: string;
  rewardPerApproval: number;
  minRedemptionPoints: number;
  maxRedemptionPoints: number;
  redemptionsEnabled: boolean;
};

type Profile = { id: string; email: string; display_name: string; account_status: string; member_since: string };

type ApiPayload = { ok?: boolean; error?: string; message?: string; submissions?: Submission[]; submission?: { id: string; status: string } };

type RewardsPayload = { ok?: boolean; rewards?: Rewards; recent_entries?: RewardEntry[]; payout_requests?: PayoutRequest[]; error?: string };

const statusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: 'Awaiting review', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  rejected: { label: 'Not approved', className: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
};

const payoutStatusMeta: Record<string, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  under_review: { label: 'Under review', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  processing: { label: 'Payment in progress', className: 'bg-lime-50 text-lime-800 ring-1 ring-lime-300' },
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200' },
};

function statusPill(status: string) {
  const conf = statusMeta[status] ?? { label: status, className: 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${conf.className}`}>{conf.label}</span>;
}

function payoutPill(status: string) {
  const conf = payoutStatusMeta[status] ?? { label: status, className: 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${conf.className}`}>{conf.label}</span>;
}

const IN_FLIGHT = new Set(['requested', 'under_review', 'approved', 'processing']);

export default function DashboardPage() {
  const router = useRouter();
  const { session, loading } = useLinkDropSession();
  const [postUrl, setPostUrl] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceType, setResourceType] = useState('other');
  const [description, setDescription] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [rewardEntries, setRewardEntries] = useState<RewardEntry[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [payoutNotice, setPayoutNotice] = useState('');

  const loadHistory = useCallback(async () => {
    if (!session?.access_token) return;
    setHistoryBusy(true);
    try {
      const response = await fetch('/api/me/submissions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load submissions.');
      setSubmissions(payload.submissions ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load submissions.');
    } finally {
      setHistoryBusy(false);
    }
  }, [session?.access_token]);

  const loadProfile = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/me/profile', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as { ok?: boolean; profile?: Profile; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Could not load profile.');
      setProfile(payload.profile ?? null);
    } catch (cause) {
      console.error('Profile load failed:', cause);
    }
  }, [session?.access_token]);

  const loadRewards = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/me/rewards', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as RewardsPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load rewards.');
      setRewards(payload.rewards ?? null);
      setRewardEntries(payload.recent_entries ?? []);
      setPayoutRequests(payload.payout_requests ?? []);
    } catch (cause) {
      console.error('Rewards load failed:', cause);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) {
      void loadHistory();
      void loadProfile();
      void loadRewards();
    }
  }, [session?.access_token, loadHistory, loadProfile, loadRewards]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token) return;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ postUrl, resourceUrl, resourceType, description })
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Submission failed.');
      setNotice(payload.message ?? 'Submission received.');
      if (payload.submission) {
        setPostUrl('');
        setResourceUrl('');
        setResourceType('other');
        setDescription('');
      }
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  };

  const requestPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token) return;
    const amount = Number(payoutAmount);
    if (!Number.isInteger(amount) || amount < (rewards?.minRedemptionPoints ?? MIN_REDEMPTION_POINTS)) {
      setPayoutError(`Enter a whole number of at least ${rewards?.minRedemptionPoints ?? MIN_REDEMPTION_POINTS} points.`);
      return;
    }

    const confirmed = window.confirm(
      `Request a payout of ${amount} points? The review team will handle the payment, and you will not be able to spend these points while it is in review.`
    );
    if (!confirmed) return;

    setPayoutBusy(true);
    setPayoutError('');
    setPayoutNotice('');
    try {
      const response = await fetch('/api/me/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ amountPoints: amount })
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Could not submit the payout request.');
      setPayoutNotice('Payout request sent. The review team will confirm it here.');
      setPayoutAmount('');
      await loadRewards();
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'Could not submit the payout request.');
    } finally {
      setPayoutBusy(false);
    }
  };

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Loading your workspace…</main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper px-5">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Sign in required</h1>
          <p className="mt-2 text-sm text-linkdrop-muted">Sign in to submit resources and track your contributions.</p>
          <Link href="/login" className="mt-5 inline-block rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410] transition hover:brightness-95">Go to sign in →</Link>
        </div>
      </main>
    );
  }

  const inFlightPayout = payoutRequests.some((p) => IN_FLIGHT.has(p.status));
  const payoutPossible = Boolean(
    rewards?.redemptionsEnabled &&
    profile?.account_status === 'active' &&
    !inFlightPayout &&
    (rewards?.availablePoints ?? 0) >= (rewards?.minRedemptionPoints ?? MIN_REDEMPTION_POINTS)
  );

  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-linkdrop-line bg-linkdrop-paper/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] w-[min(1060px,calc(100%-40px))] items-center justify-between gap-4">
          <Link href="/" className="text-lg font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink sm:block">Find a resource</Link>
            <button
              onClick={signOut}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-linkdrop-ink shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[min(1060px,calc(100%-40px))] space-y-6 py-10">
        {profile && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Your workspace</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hey, {profile.display_name} 👋</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-linkdrop-muted">
              <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-linkdrop-line">{profile.email}</span>
              <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-linkdrop-line">
                Member since {new Date(profile.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        )}

        {/* Rewards */}
        <section className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Rewards</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Your credit balance</h2>
              {rewards && (
                <p className="mt-1 text-xs text-linkdrop-muted">
                  Rule {rewards.ruleVersion}: +{rewards.rewardPerApproval} points per approved link.
                </p>
              )}
            </div>
            <button
              onClick={() => void loadRewards()}
              disabled={historyBusy}
              className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-semibold ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-100 disabled:opacity-50"
            >
              {historyBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#f4fae8] p-5 ring-1 ring-[#cbe3a8]">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-forest">Available</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rewards ? rewards.availablePoints : '—'}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">usable in payout requests</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-700">Pending review</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rewards ? rewards.pendingReviewPoints : '—'}</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-5 ring-1 ring-linkdrop-line">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-muted">Held for payout</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rewards ? rewards.outstandingPoints : '—'}</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-5 ring-1 ring-linkdrop-line">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-muted">Paid out</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rewards ? rewards.paidOutPoints : '—'}</p>
            </div>
          </div>

          {/* Payout request */}
          <div className="mt-8 rounded-xl bg-[#f4fae8] p-5 ring-1 ring-[#cbe3a8]">
            <h3 className="text-sm font-bold">Request a payout</h3>
            <p className="mt-1 text-xs text-neutral-600">
              Payouts are handled personally by the review team. Minimum {rewards?.minRedemptionPoints ?? MIN_REDEMPTION_POINTS} points.
              {rewards && rewards.availablePoints > 0 && (
                <> You can currently request up to <span className="font-semibold">{rewards.availablePoints}</span>.</>
              )}
            </p>
            {rewards && !rewards.redemptionsEnabled && (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                Payout requests are closed right now. Check back later.
              </p>
            )}
            {inFlightPayout && (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                You already have a payout request in review.
              </p>
            )}
            {payoutPossible && (
              <form className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center" onSubmit={requestPayout}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={rewards?.minRedemptionPoints ?? MIN_REDEMPTION_POINTS}
                  max={rewards?.availablePoints ?? 0}
                  step={1}
                  value={payoutAmount}
                  onChange={(event) => setPayoutAmount(event.target.value)}
                  placeholder={`${rewards?.minRedemptionPoints ?? MIN_REDEMPTION_POINTS} – ${rewards?.availablePoints ?? 0} points`}
                  required
                  className="w-full rounded-lg border border-[#cbe3a8] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-linkdrop-forest sm:max-w-[280px]"
                />
                <button
                  disabled={payoutBusy}
                  className="rounded-lg bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {payoutBusy ? 'Sending…' : 'Request payout →'}
                </button>
              </form>
            )}
            {payoutError && <p role="alert" className="mt-3 rounded-lg bg-[#fff0ee] px-3 py-2 text-xs text-[#923b36]">{payoutError}</p>}
            {payoutNotice && <p role="status" className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-[#4d5a3f] ring-1 ring-[#cbe3a8]">{payoutNotice}</p>}
          </div>

          {/* Payout history */}
          {payoutRequests.length > 0 && (
            <div className="mt-6 border-t border-linkdrop-line pt-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Payout requests</h3>
              <div className="mt-3 divide-y divide-neutral-100">
                {payoutRequests.map((payout) => (
                  <div key={payout.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold">{payout.amount} pts</p>
                        {payoutPill(payout.status)}
                      </div>
                      {payout.payout_reference && (
                        <p className="mt-0.5 text-xs text-linkdrop-muted">Reference: {payout.payout_reference}</p>
                      )}
                      {payout.decision_reason && (
                        <p className="mt-0.5 text-xs text-linkdrop-muted">Reviewer note: {payout.decision_reason}</p>
                      )}
                    </div>
                    <p className="text-xs text-linkdrop-muted">{new Date(payout.decided_at ?? payout.requested_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ledger history */}
          {rewardEntries.length > 0 && (
            <div className="mt-6 border-t border-linkdrop-line pt-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Recent activity</h3>
              <div className="mt-3 divide-y divide-neutral-100">
                {rewardEntries.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-semibold">{EXPLANATION_LABELS[entry.explanation_code] ?? entry.explanation_code}</p>
                      <p className="text-xs text-linkdrop-muted">{entry.entry_type} · {entry.status}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${entry.entry_type === 'earn' && entry.amount > 0 ? 'text-linkdrop-forest' : ''}`}>
                        {entry.entry_type === 'redeem' || entry.entry_type === 'reversal' ? '−' : '+'}{Math.abs(entry.amount)}
                      </p>
                      <p className="text-xs text-linkdrop-muted">{new Date(entry.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Submit */}
        <section className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Share a resource</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Submit something new</h2>
            </div>
            <p className="text-xs text-linkdrop-muted">+{rewards?.rewardPerApproval ?? 25} points when approved</p>
          </div>
          <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Instagram post URL</span>
              <input
                type="url"
                value={postUrl}
                onChange={(event) => setPostUrl(event.target.value)}
                placeholder="https://www.instagram.com/reel/…"
                required
                maxLength={2048}
                className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Resource URL</span>
              <input
                type="url"
                value={resourceUrl}
                onChange={(event) => setResourceUrl(event.target.value)}
                placeholder="https://…"
                required
                maxLength={4096}
                className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Resource type</span>
              <select
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
                className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
              >
                <option value="preset">Preset / LUT</option>
                <option value="template">Template</option>
                <option value="pdf">PDF / ebook</option>
                <option value="project_file">Project file</option>
                <option value="tutorial">Tutorial</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Description <span className="font-medium text-neutral-400">(optional)</span></span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="What does the resource contain?"
                className="w-full resize-y rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
              />
            </label>
            {error && (
              <p role="alert" className="md:col-span-2 rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>
            )}
            {notice && (
              <p role="status" className="md:col-span-2 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>
            )}
            <div className="md:col-span-2">
              <button
                disabled={busy}
                className="rounded-xl bg-linkdrop-lime px-6 py-3.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Submitting…' : 'Submit for review →'}
              </button>
            </div>
          </form>
        </section>

        {/* History */}
        <section className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Contributions</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Your submissions</h2>
            </div>
            <button
              onClick={() => void loadHistory()}
              disabled={historyBusy}
              className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-semibold ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-100 disabled:opacity-50"
            >
              {historyBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center">
              <p className="text-sm font-semibold">No submissions yet</p>
              <p className="mt-1 text-xs text-linkdrop-muted">Resources you share will show up here with their review status.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {submissions.map((item) => (
                <li key={item.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {statusPill(item.status)}
                      <p className="mt-2 break-all text-sm font-semibold">{item.description || item.resourceType}</p>
                      <a href={item.resourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 block break-all text-xs text-linkdrop-forest underline underline-offset-2">
                        {item.resourceUrl}
                      </a>
                    </div>
                    <p className="shrink-0 text-xs text-linkdrop-muted">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="pt-2 text-xs leading-relaxed text-linkdrop-muted">
          Submission is not endorsement. LinkDrop must verify accuracy and sharing rights before publishing a resource.
        </footer>
      </main>
    </div>
  );
}
