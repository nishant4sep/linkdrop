import { fetchActivePromotion } from '@/lib/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, minimal payload for the search interstitial: the current earned
 * sponsor (if any). The active_promotion RPC re-checks top-of-leaderboard
 * eligibility per call, so a dropped winner means "no ad" instantly.
 */
export async function GET() {
  const promo = await fetchActivePromotion();
  return Response.json(promo, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
