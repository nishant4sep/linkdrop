import Link from 'next/link';
import { HomeLookup } from '@/components/home-lookup';
import { LivePresence } from '@/components/live-presence';
import { SponsorSlot, SponsorStrip } from '@/components/sponsor';
import { fetchActivePromotion, fetchLeaderboard, fetchPublicStats } from '@/lib/live';
import { PROMO_MIN_LINKS, PROMO_TOP_N } from '@/lib/site';

/**
 * Post-pivot public home page: a pure anonymous directory that paints instantly,
 * with the phase-2 live counter strip and sponsor slot rendered server-side
 * from real database numbers (never placeholders, never faked).
 */
export const revalidate = 30;

export default function Home() {
  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      <HomeHero />
      <HowItWorks />
      <HomePodium />
      <HomeFooter />
    </div>
  );
}

async function HomeHero() {
  const [stats, promo] = await Promise.all([fetchPublicStats(), fetchActivePromotion()]);

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-linkdrop-line bg-linkdrop-paper/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] w-[min(1060px,calc(100%-40px))] items-center justify-between gap-4">
          <Link href="/" className="text-[22px] font-extrabold tracking-tighter text-linkdrop-ink">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <nav className="flex items-center gap-5">
            <a href="#leaderboard-teaser" className="text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink">
              Leaderboard
            </a>
            <a href="#how-it-works" className="text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink">
              How it works
            </a>
          </nav>
        </div>
      </header>

      {/* Hero + lookup */}
      <section className="px-5 pb-14 pt-20 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow-chip inline-flex items-center gap-2 rounded-full border border-linkdrop-line bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-linkdrop-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-linkdrop-forest" />
            Community resource finder
          </p>
          <h1 className="mt-7 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Find the resource.
            <br />
            <span className="text-linkdrop-muted">Skip the ritual.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-linkdrop-muted sm:text-lg">
            No &ldquo;comment LINK.&rdquo; No waiting for a DM. Paste the Instagram post and check whether someone has already shared its resource.
          </p>
        </div>

        <HomeLookup />

        {/* Live counters — real numbers from the database, or nothing. */}
        {(stats.activeResources !== null || stats.postsCovered !== null) && (
          <div className="mx-auto mt-12 w-[min(680px,100%)]">
            <div className="flex items-stretch justify-center divide-x divide-linkdrop-line rounded-2xl border border-linkdrop-line bg-white shadow-soft">
              {stats.activeResources !== null && (
                <div className="w-1/2 px-6 py-5 text-center">
                  <p className="text-3xl font-extrabold tracking-tight">{stats.activeResources.toLocaleString('en-US')}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-linkdrop-muted">Resources live now</p>
                </div>
              )}
              {stats.postsCovered !== null && (
                <div className="w-1/2 px-6 py-5 text-center">
                  <p className="text-3xl font-extrabold tracking-tight">{stats.postsCovered.toLocaleString('en-US')}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-linkdrop-muted">Instagram posts covered</p>
                </div>
              )}
            </div>
            <LivePresence />
          </div>
        )}

        {/* Sponsor slot: a winner's promotion, or the honest invitation. */}
        <div className="mx-auto mt-6 w-[min(680px,100%)]">
          {promo.active ? (
            <SponsorSlot promo={promo} />
          ) : (
            <aside className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-soft">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-linkdrop-muted">
                Sponsor slot · currently a leaderboard reward
              </p>
              <p className="mt-2 text-sm font-bold">
                Whoever tops the live leaderboard gets their own ad here — seen by every visitor.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-linkdrop-muted">
                Share genuine links, create a free username, climb the board. Fully automated and fair: the rank decides who gets the slot — no payments, no bidding, no favors — and only the owner vets content for safety.
              </p>
              <div id="leaderboard-teaser" className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Link href="/leaderboard" className="rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95">
                  See the live leaderboard →
                </Link>
                <Link href="/login" className="rounded-xl border border-linkdrop-line bg-white px-5 py-2.5 text-sm font-bold text-linkdrop-ink transition hover:bg-neutral-50">
                  Create a free username
                </Link>
              </div>
            </aside>
          )}
        </div>
      </section>
    </>
  );
}

const STEPS = [
  { step: '01', title: 'Paste the post', desc: 'Use the public URL of an Instagram post or Reel that promised a resource.' },
  { step: '02', title: 'Check the directory', desc: 'Links shared by the community appear instantly. One report and any bad link vanishes in a second.' },
  { step: '03', title: 'Share what you find', desc: 'Missing? Add it in 20 seconds — no account needed — and every future visitor gets it.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-linkdrop-line px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">How it works</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Three steps, zero waiting</h2>
        <p className="mt-4 text-sm text-linkdrop-muted">No scraping, no DMs, no guessing. Just community-shared resource links.</p>
      </div>
      <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <article key={step.step} className="rounded-2xl border border-linkdrop-line bg-white p-8 shadow-soft transition-transform duration-200 hover:-translate-y-1">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf4df] text-xs font-extrabold text-linkdrop-forest">
              {step.step}
            </span>
            <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-linkdrop-muted">{step.desc}</p>
          </article>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-neutral-500">
        Signed-in contributors with genuine links are ranked publicly; the top {PROMO_TOP_N} (min. {PROMO_MIN_LINKS} live links each) may promote their own link on heavily-trafficked pages.
      </p>
    </section>
  );
}

async function HomePodium() {
  // Fills the pre-footer stretch with real content: the live podium (genuine
  // links only) plus one more earned-placement surface. Degrades to the
  // invite card whenever the leaderboard is empty or waking up.
  const [board, promo] = await Promise.all([fetchLeaderboard(3), fetchActivePromotion()]);

  return (
    <section className="border-t border-linkdrop-line px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">The live podium</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">No points. Just who&apos;s genuinely helping.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-linkdrop-muted">
          Names here rank automatically by currently-live genuine links — the machine keeps it fair; nobody can buy a rank.
        </p>
      </div>

      {board.ok && board.rows.length > 0 ? (
        <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
          {board.rows.map((row) => (
            <article
              key={row.userId}
              className={`rounded-2xl border bg-white p-6 text-center shadow-soft ${
                row.position === 1 ? 'border-[#cbe3a8] sm:-translate-y-1' : 'border-linkdrop-line'
              }`}
            >
              <p className="text-4xl font-extrabold tracking-tight">{['🥇', '🥈', '🥉'][row.position - 1]}</p>
              <p className="mt-2 truncate text-sm font-extrabold">@{row.username}</p>
              <p className="mt-0.5 text-xs text-linkdrop-muted">
                {row.liveLinks.toLocaleString('en-US')} live link{row.liveLinks === 1 ? '' : 's'}
              </p>
              {row.position <= PROMO_TOP_N && (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5a7a33]">Earned promo slot</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-8 text-center text-sm text-linkdrop-muted">
          The podium is empty on purpose: it fills only with real contributors. Be first?{' '}
          <Link href="/login" className="font-bold text-linkdrop-forest underline underline-offset-2">Claim your username</Link>
        </p>
      )}

      <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link href="/leaderboard" className="rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95">
          Full live board →
        </Link>
        <Link href="/" className="rounded-xl border border-linkdrop-line bg-white px-5 py-2.5 text-sm font-bold text-linkdrop-ink transition hover:bg-neutral-50">
          Find a resource
        </Link>
      </div>

      <div className="mx-auto mt-12 w-[min(680px,100%)]">
        <SponsorStrip promo={promo} />
      </div>
    </section>
  );
}

function HomeFooter() {
  return (
    <footer className="border-t border-linkdrop-line bg-white px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-[min(1060px,100%)] flex-col items-center justify-between gap-4 md:flex-row">
        <Link href="/" className="flex items-center gap-1 text-lg font-extrabold tracking-tighter">
          linkdrop<span className="text-linkdrop-forest">.</span>
        </Link>
        <p className="text-xs text-neutral-500">Independent project. Not affiliated with Instagram or Meta.</p>
        <div className="flex items-center gap-5 text-xs font-medium text-linkdrop-ink">
          <Link href="/leaderboard" className="transition-colors hover:text-linkdrop-forest">Leaderboard</Link>
          <Link href="/terms" className="transition-colors hover:text-linkdrop-forest">Terms</Link>
          <Link href="/privacy" className="transition-colors hover:text-linkdrop-forest">Privacy</Link>
          <Link href="/dmca" className="transition-colors hover:text-linkdrop-forest">DMCA</Link>
        </div>
      </div>
    </footer>
  );
}
