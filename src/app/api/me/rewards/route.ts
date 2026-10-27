import { jsonError, requireUser } from '@/lib/server';
import { loadRedemptions, loadRewardEntries, rewardStateFor } from '@/lib/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  try {
    const [entries, redemptions] = await Promise.all([
      loadRewardEntries(auth.user.id),
      loadRedemptions(auth.user.id),
    ]);

    const state = rewardStateFor(entries, redemptions);

    // Explainable history: immutable events, newest first.
    const recent_entries = entries.slice(0, 25).map((entry) => ({
      id: entry.id,
      amount: Number(entry.amount),
      entry_type: entry.entry_type,
      status: entry.status,
      rule_version: entry.rule_version,
      explanation_code: entry.explanation_code,
      created_at: entry.created_at,
    }));

    const payout_requests = redemptions.slice(0, 25).map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      status: row.status,
      payout_reference: row.payout_reference,
      decision_reason: row.decision_reason,
      requested_at: row.requested_at,
      decided_at: row.decided_at,
    }));

    return Response.json({
      ok: true,
      rewards: state,
      recent_entries,
      payout_requests,
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('Reward state lookup failed:', error instanceof Error ? error.message : error);
    return jsonError('Your rewards could not be loaded.', 500);
  }
}
