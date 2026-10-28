import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchActivePromotion, fetchLeaderboard } from '@/lib/live';
import { SponsorSlot } from '@/components/sponsor';
import { PROMO_MIN_LINKS, PROMO_TOP_N } from '@/lib/site';

/**
 * The live leaderboard: real contributor names ranked by how many of their
 * links are GENUINE and live right now. Nothing here is projected, estimated,
 * or fake: an empty board shows an honest empty state.
 */
export const dynamic = 'force-dynamic';

const PROMO_WINDOW_TEXT = 'a day';

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://linkdrop.example.com';

export const metadata: Metadata = {
  title: 'Leaderboard — top community contributors · LinkDrop',
  description:
    'The live LinkDrop leaderboard. Contributors are ranked by the number of genuine, currently-live links they have shared. The top names earn a promotion slot on the site.',
  alternates: { canonical: `${BASE}/leaderboard` },
  openGraph: {
    title: 'LinkDrop leaderboard — top community contributors',
    description: 'Ranked by genuine links shared. Top names earn the right to promote their own ad to every visitor.',
    url: `${BASE}/leaderboard`,
    type: 'website',
  },
};

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function LeaderboardPage(_props: Props) {
  const [board, promo] = await Promise.all([fetchLeaderboard(50), fetchActivePromotion()]);
  const topThree = new Set(board.rows.slice(0, PROMO_TOP_N).map((row) => row.position));

  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      <header className="sticky top-0 z-20 border-b border-linkdrop-line bg-linkdrop-paper/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] w-[min(900px,calc(100%-40px))] items-center justify-between">
          <Link href="/" className="text-[22px] font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <Link href="/" className="text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink">
            Find a resource
          </Link>
        </div>
      </header>

      <main className="mx-auto w-[min(900px,calc(100%-40px))] py-14">
        <p className="eyebrow-chip inline-flex items-center gap-2 rounded-full border border-linkdrop-line bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-linkdrop-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-linkdrop-forest" />
          Live · refreshed as links go live
        </p>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">Community leaderboard</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-linkdrop-muted sm:text-base">
          Ranked by one thing only: how many of your links are <span className="font-bold text-linkdrop-ink">genuine and live right now</span>.
          A link that is reported (hidden) or permanently removed drops off your count automatically — the board can run hot with trash,
          only real contributions hold rank.
        </p>

        {!board.ok && (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="font-semibold">The leaderboard is waking back up</p>
            <p className="mt-1 text-sm text-linkdrop-muted">Nothing is being hidden — the data service is briefly unavailable. Refresh in a moment.</p>
          </div>
        )}

        {board.ok && board.rows.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <p className="font-bold">No ranked contributors yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-linkdrop-muted">
              The board starts the moment someone signs in with a username and shares a genuine link that stays live. That someone could be you —
              it is still early, easy days.
            </p>
            <Link href="/login" className="mt-5 inline-block rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410] transition hover:brightness-95">
              Create your username →
            </Link>
          </div>
        )}

        {board.ok && board.rows.length > 0 && (
          <ol className="mt-10 space-y-2.5">
            {board.rows.map((row) => (
              <li
                key={row.userId}
                className={`flex items-center justify-between gap-4 rounded-2xl border bg-white px-5 py-4 shadow-soft ${
                  topThree.has(row.position) ? 'border-[#cbe3a8]' : 'border-linkdrop-line'
                }`}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                    row.position === 1 ? 'bg-[#eaf4df] text-linkdrop-forest'
                    : topThree.has(row.position) ? 'bg-[#f4fae8] text-[#5a7a33]'
                    : 'bg-neutral-100 text-linkdrop-muted'
                  }`}>
                    {row.position}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">@{row.username}</p>
                    {topThree.has(row.position) && (
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5a7a33]">Promo slot eligible</p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-extrabold tracking-tight">{row.liveLinks.toLocaleString('en-US')}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-linkdrop-muted">live links</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* How to enter the race */}
        <section className="mt-12 rounded-2xl border border-linkdrop-line bg-white p-8 shadow-soft">
          <h2 className="text-2xl font-extrabold tracking-tight">How to climb (the honest rules)</h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-neutral-700">
            <li><span className="font-bold">1.</span> Sign in with a username + password (no email asked, takes 20 seconds).</li>
            <li><span className="font-bold">2.</span> Share real resource links through the normal instant-publish form — signed-in submissions are credited automatically.</li>
            <li><span className="font-bold">3.</span> Counted = currently live. Reported/hidden or removed links leave the count (and so do demo or junk items).</li>
            <li><span className="font-bold">4.</span> Fake, spammy, or misleading links get reported by users or removed by the owner — they cost you all credit and more.</li>
            <li><span className="font-bold">5.</span> Stay inside the top {PROMO_TOP_N} with at least {PROMO_MIN_LINKS} live links, and you may submit your own promotion (headline + link). The owner approves it before it runs for about {PROMO_WINDOW_TEXT} — and only while you remain on top.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95">
              Create a free username
            </Link>
            <Link href="/" className="rounded-xl border border-linkdrop-line bg-white px-5 py-2.5 text-sm font-bold text-linkdrop-ink transition hover:bg-neutral-50">
              Back to search
            </Link>
          </div>
        </section>

        <div className="mt-10">
          {promo.active
            ? <SponsorSlot promo={promo} dense />
            : (
              <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-5 text-center text-sm text-linkdrop-muted">
                The sponsor slot is open: reach the top of this board and promote what you want (within the guidelines).
              </p>
            )}
        </div>
      </main>

      <footer className="border-t border-linkdrop-line bg-white px-5 py-6">
        <p className="mx-auto w-[min(900px,100%)] text-center text-xs text-neutral-500">
          Independent project. Not affiliated with Instagram or Meta. ·{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-linkdrop-ink">Terms</Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-linkdrop-ink">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
