'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLinkDropSession } from '@/components/use-linkdrop-session';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { PROMO_MIN_LINKS, PROMO_TOP_N, PROMO_WINDOW_HOURS, PROMO_GUIDELINES } from '@/lib/site';

type Submission = {
  id: string;
  postUrl: string | null;
  resourceUrl: string;
  resourceType: string;
  description: string | null;
  status: string;
  createdAt: string;
};

type Rank = { rank: number | null; liveLinks: number; eligible: boolean } | null;

type PromoRequest = {
  id: string;
  headline: string;
  detail: string | null;
  targetUrl: string;
  status: string;
  ownerNote: string | null;
  activeUntil: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type PromotionsPayload = {
  ok?: boolean;
  error?: string;
  eligibility?: Rank;
  requests?: PromoRequest[];
  hasPending?: boolean;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  approved: { label: 'Live & counted', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  pending: { label: 'Awaiting owner review', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  quarantined: { label: 'Hidden after a report', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  rejected: { label: 'Removed', className: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
};

function statusPill(status: string) {
  const conf = STATUS_META[status] ?? { label: status, className: 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${conf.className}`}>{conf.label}</span>;
}

/**
 * Phase-2 account page. NO points, NO rewards — everything here is about the
 * count-based live leaderboard and your own submitted links.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { session, loading } = useLinkDropSession();
  const [profile, setProfile] = useState<{ username: string | null; display_name: string; member_since: string } | null>(null);
  const [rank, setRank] = useState<Rank>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [promoRequests, setPromoRequests] = useState<PromoRequest[]>([]);
  const [hasPending, setHasPending] = useState(false);
  const [headline, setHeadline] = useState('');
  const [detail, setDetail] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState('');

  const loadHistory = useCallback(async () => {
    if (!session?.access_token) return;
    setHistoryBusy(true);
    try {
      const response = await fetch('/api/me/submissions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as { ok?: boolean; error?: string; submissions?: Submission[] };
      if (!response.ok) throw new Error(payload.error ?? 'Could not load your submissions.');
      setSubmissions(payload.submissions ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your submissions.');
    } finally {
      setHistoryBusy(false);
    }
  }, [session?.access_token]);

  const loadPromotions = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/me/promotions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as PromotionsPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Could not load your promotion status.');
      setRank(payload.eligibility ?? null);
      setPromoRequests(payload.requests ?? []);
      setHasPending(payload.hasPending ?? false);
    } catch (cause) {
      console.error('Promotion status load failed:', cause);
    }
  }, [session?.access_token]);

  const loadProfile = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch('/api/me/profile', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as { ok?: boolean; error?: string; profile?: { username: string | null; display_name: string; member_since: string }; rank?: Rank };
      if (!response.ok) throw new Error(payload.error ?? 'Could not load your profile.');
      if (payload.profile) {
        setProfile({ username: payload.profile.username, display_name: payload.profile.display_name, member_since: payload.profile.member_since });
      }
      if (payload.rank !== undefined) setRank(payload.rank);
    } catch (cause) {
      console.error('Profile load failed:', cause);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) {
      void loadProfile();
      void loadHistory();
      void loadPromotions();
    }
  }, [session?.access_token, loadProfile, loadHistory, loadPromotions]);

  const requestPromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token) return;
    setPromoBusy(true);
    setPromoError('');
    setNotice('');
    try {
      const response = await fetch('/api/me/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ headline, detail, targetUrl }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The request could not be sent.');
      setNotice(payload.message ?? 'Request sent.');
      setHeadline('');
      setDetail('');
      setTargetUrl('');
      await loadPromotions();
    } catch (cause) {
      setPromoError(cause instanceof Error ? cause.message : 'The request could not be sent.');
    } finally {
      setPromoBusy(false);
    }
  };

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">Loading your account…</main>;
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper px-5">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Sign in required</h1>
          <p className="mt-2 text-sm text-linkdrop-muted">Sign in to see your links and your leaderboard standing.</p>
          <Link href="/login" className="mt-5 inline-block rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410] transition hover:brightness-95">Go to sign in →</Link>
        </div>
      </main>
    );
  }

  const canRequestPromo = Boolean(rank?.eligible) && !hasPending;

  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-linkdrop-line bg-linkdrop-paper/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] w-[min(900px,calc(100%-40px))] items-center justify-between gap-4">
          <Link href="/" className="text-lg font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/leaderboard" className="hidden text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink sm:block">Leaderboard</Link>
            <button
              onClick={signOut}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-linkdrop-ink shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[min(900px,calc(100%-40px))] space-y-6 py-10">
        {error && (
          <p role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{error}</p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>
        )}
        {profile?.username && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Your account</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight">@{profile.username}</h1>
            </div>
            <p className="text-xs text-linkdrop-muted">
              Joined {new Date(profile.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}
        {profile && !profile.username && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            This is an older email account without a username, so leaderboard credit cannot attach to it. Contact the owner to add a username.
          </div>
        )}

        {/* Live rank */}
        <section className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Live leaderboard standing</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">No points here — your rank is your genuine links</h2>
            </div>
            <button
              onClick={() => { void loadProfile(); void loadHistory(); void loadPromotions(); }}
              disabled={historyBusy}
              className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-semibold ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-100 disabled:opacity-50"
            >
              {historyBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-[#f4fae8] p-5 ring-1 ring-[#cbe3a8]">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-forest">Live links</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rank ? rank.liveLinks.toLocaleString('en-US') : '—'}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">currently live & counted</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-5 ring-1 ring-linkdrop-line">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-muted">Board position</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rank?.rank ? `#${rank.rank}` : '—'}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">{rank?.rank ? 'of everyone with live links' : 'share links to appear'}</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-5 ring-1 ring-linkdrop-line">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-linkdrop-muted">Promo eligibility</p>
              <p className="mt-1.5 text-2xl font-extrabold">{rank?.eligible ? 'Earned' : 'Locked'}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {rank?.eligible ? 'you may submit an ad below' : `top ${PROMO_TOP_N} with ${PROMO_MIN_LINKS}+ live links`}
              </p>
            </div>
          </div>
          {!rank?.eligible && (
            <p className="mt-4 text-xs text-linkdrop-muted">
              Counted links are the ones live right now. Reported or removed links leave the count — quality is the strategy.
            </p>
          )}
        </section>

        {/* Promotion request */}
        <section className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Your sponsored slot</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Promote your own link</h2>
          <p className="mt-2 text-sm leading-relaxed text-linkdrop-muted">
            Promo rights are a leaderboard reward, not a purchase. If your request passes owner review it runs for roughly {PROMO_WINDOW_HOURS} hours — and keeps rendering only while you stay at the top.
          </p>

          <ul className="mt-4 space-y-1 rounded-xl bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-700 ring-1 ring-linkdrop-line">
            {PROMO_GUIDELINES.map((rule, index) => (
              <li key={index}><span className="font-bold">{index + 1}.</span> {rule}</li>
            ))}
          </ul>

          {promoRequests.some((row) => row.status === 'approved' && row.activeUntil && new Date(row.activeUntil) > new Date()) && (
            <p className="mt-4 rounded-lg bg-[#eaf4df] px-3 py-2 text-xs font-semibold text-[#4a6a2f] ring-1 ring-[#cbe3a8]">
              Your promotion is live right now. Nice work.
            </p>
          )}
          {hasPending && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              A request is waiting for owner review — you cannot queue a second one.
            </p>
          )}

          {canRequestPromo ? (
            <form className="mt-5 space-y-4" onSubmit={requestPromo}>
              <label className="block">
                <span className="mb-2 block text-xs font-bold">Ad headline <span className="font-medium text-neutral-400">(1–80 chars, what visitors will read)</span></span>
                <input
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  maxLength={80}
                  required
                  placeholder="e.g. My free Lightroom preset pack"
                  className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest focus:ring-2 focus:ring-linkdrop-lime/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold">Short detail <span className="font-medium text-neutral-400">(optional)</span></span>
                <input
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  maxLength={200}
                  placeholder="One honest sentence about the destination"
                  className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold">Destination URL <span className="font-medium text-neutral-400">(direct https:// link)</span></span>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  required
                  maxLength={2000}
                  placeholder="https://…"
                  className="w-full rounded-xl border border-linkdrop-line bg-white px-4 py-3 text-sm outline-none transition focus:border-linkdrop-forest"
                />
              </label>
              {promoError && <p role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">{promoError}</p>}
              <button
                disabled={promoBusy}
                className="rounded-xl bg-linkdrop-lime px-6 py-3.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {promoBusy ? 'Sending…' : 'Submit for owner review →'}
              </button>
            </form>
          ) : (
            !hasPending && !promoRequests.some((row) => row.status === 'approved') && (
              <p className="mt-5 rounded-xl border border-dashed border-neutral-300 p-5 text-center text-sm text-linkdrop-muted">
                Not eligible yet. Share genuine links, stay live,{rank?.liveLinks ? ` then submit your ad here directly — you are at #${rank.rank ?? '—'}.` : ` climb into the top ${PROMO_TOP_N} with ${PROMO_MIN_LINKS}+ live links.`}
              </p>
            )
          )}

          {notice && <p role="status" className="mt-4 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">{notice}</p>}

          {promoRequests.length > 0 && (
            <div className="mt-6 border-t border-linkdrop-line pt-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Your requests</p>
              <ul className="mt-3 divide-y divide-neutral-100">
                {promoRequests.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{row.headline}</p>
                      <a href={row.targetUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs text-linkdrop-forest underline underline-offset-2">{row.targetUrl}</a>
                      {row.ownerNote && <p className="mt-1 text-xs text-linkdrop-muted">Owner note: {row.ownerNote}</p>}
                    </div>
                    <div className="text-right">
                      {statusPill(row.status)}
                      {row.activeUntil && <p className="mt-1 text-[11px] text-linkdrop-muted">until {new Date(row.activeUntil).toLocaleString()}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Your submitted links */}
        <section className="rounded-2xl border border-linkdrop-line bg-white p-7 shadow-soft">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Everything you shared</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Your submitted links</h2>
            </div>
          </div>

          {submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center">
              <p className="text-sm font-semibold">Nothing yet</p>
              <p className="mt-1 text-xs text-linkdrop-muted">
                Every link you share while signed in shows up here and counts toward the leaderboard.{' '}
                <Link href="/" className="font-bold text-linkdrop-forest underline underline-offset-2">Add your first one →</Link>
              </p>
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
                      {item.postUrl && (
                        <a href={item.postUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block text-xs text-linkdrop-muted underline underline-offset-2">
                          On this Instagram post ↗
                        </a>
                      )}
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
          Keep it genuine: the leaderboard counts only links that are live right now, and every report is reviewed by a human.
        </footer>
      </main>
    </div>
  );
}
