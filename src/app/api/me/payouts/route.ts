import { db, jsonError, requestOriginAllowed, requireUser } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  decidePayoutRequest,
  loadRedemptions,
  loadRewardEntries,
  redemptionsEnabled,
  rewardStateFor
} from '@/lib/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

/**
 * Contributor requests the owner to payout points. The reservation happens
 * atomically inside request_linkdrop_redemption (advisory lock + balance
 * re-check), so this route never trusts a read-then-write balance check.
 */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  try {
    const redemptions = await loadRedemptions(auth.user.id);
    return Response.json({
      ok: true,
      payouts: redemptions.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        status: row.status,
        payout_reference: row.payout_reference,
        decision_reason: row.decision_reason,
        requested_at: row.requested_at,
        decided_at: row.decided_at,
      })),
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('Payout list lookup failed:', error instanceof Error ? error.message : error);
    return jsonError('Your payout requests could not be loaded.', 500);
  }
}

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return jsonError('Request origin is not allowed.', 403);

  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  if (!redemptionsEnabled()) {
    return jsonError('Payout requests are not open right now.', 409);
  }

  // Server-enforced throttle: payout flooding cannot pressure the review queue.
  try {
    const limit = await consumeRateLimit('payout-request-user', auth.user.id, 3, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  } catch {
    return jsonError('This action is temporarily unavailable. Please retry shortly.', 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Send a valid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid payout request.', 400);
  }
  const input = body as Record<string, unknown>;

  try {
    const [entries, redemptions] = await Promise.all([
      loadRewardEntries(auth.user.id),
      loadRedemptions(auth.user.id),
    ]);

    const state = rewardStateFor(entries, redemptions);
    if (!state.redemptionsEnabled) return jsonError('Payout requests are not open right now.', 409);
    if (redemptions.some((r) => ['requested', 'under_review', 'approved', 'processing'].includes(r.status))) {
      return jsonError('You already have a payout request awaiting the review team.', 409);
    }

    const decision = decidePayoutRequest(input['amountPoints'], entries, redemptions);
    if (!decision.ok) return jsonError(decision.message, 400);

    // Idempotency key is minted server-side; an optional client header makes a
    // retried HTTP request map to the same reservation instead of a new one.
    const clientKey = cleanText(request.headers.get('Idempotency-Key'), 100);
    const idempotencyKey = clientKey
      ? `web:${auth.user.id}:${clientKey.replace(/[^\w-]/g, '')}`
      : `web:${auth.user.id}:${crypto.randomUUID()}`;

    const { data, error } = await db().rpc('request_linkdrop_redemption', {
      p_contributor_id: auth.user.id,
      p_amount: decision.amount,
      p_idempotency_key: idempotencyKey
    });

    if (error) {
      console.error('Payout RPC failed:', error.code);
      return jsonError(mapPayoutError(error), error.code === '42501' ? 403 : 500);
    }

    return Response.json({ ok: true, payout: data }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch (error) {
    console.error('Payout request failed:', error instanceof Error ? error.message : error);
    return jsonError('The payout request could not be saved right now.', 500);
  }
}

function mapPayoutError(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case '23514':
      return 'That amount is more than your available balance.';
    case '23505':
      return 'A payout request is already awaiting review.';
    case '42501':
      return 'Your account is not allowed to request payouts right now.';
    case '22023':
      return 'The payout amount is not valid.';
    default:
      return 'The payout request could not be saved right now.';
  }
}
