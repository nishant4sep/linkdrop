import type { ActivePromotion } from '@/lib/live';

/**
 * Sponsor widgets (server components — the eligible promotion is resolved
 * server-side by the active_promotion RPC; nothing here ships to the client).
 *
 * The slot is EARNED on the live leaderboard, never bought, and only renders
 * while the winner is genuinely on top with a live approval window.
 */

/**
 * The sponsor card itself, for the home page primary placement.
 */
export function SponsorSlot({ promo, dense = false }: { promo: ActivePromotion; dense?: boolean }) {
  if (!promo.ok || !promo.active || !promo.username || !promo.headline || !promo.targetUrl) return null;
  return (
    <aside className="rounded-2xl border border-linkdrop-line bg-white p-6 shadow-soft">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-linkdrop-muted">
        Promoted by @{promo.username} · leaderboard winner
      </p>
      <a
        href={promo.targetUrl}
        target="_blank"
        rel="noreferrer nofollow sponsored"
        className="mt-2 block text-base font-extrabold text-linkdrop-ink underline decoration-[#cbe3a8] decoration-4 underline-offset-4"
      >
        {promo.headline}
      </a>
      {promo.detail && !dense && <p className="mt-1.5 text-sm text-linkdrop-muted">{promo.detail}</p>}
      <p className="mt-3 text-[11px] text-neutral-400">
        Community members who stay on top of the live leaderboard earn this slot. Reviewed by the owner; not an endorsement.
      </p>
    </aside>
  );
}

/**
 * Slim banner for secondary pages (landing pages, leaderboard footer).
 * Active promo → the card; otherwise a one-line honest invitation.
 */
export function SponsorStrip({ promo }: { promo: ActivePromotion }) {
  if (promo.ok && promo.active) return <SponsorSlot promo={promo} dense />;
  return (
    <aside className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-5 text-center">
      <p className="text-sm font-bold">
        The sponsor slot is earned, not bought — hit the top of the{' '}
        <a href="/leaderboard" className="text-linkdrop-forest underline underline-offset-2">live leaderboard</a>{' '}
        and promote your own link to every visitor.
      </p>
    </aside>
  );
}
