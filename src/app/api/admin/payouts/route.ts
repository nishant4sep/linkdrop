import { NextRequest, NextResponse } from 'next/server';
import { db, jsonError, requireAdmin, requestOriginAllowed } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

/**
 * Owner payout queue. In-flight requests are the actionable part; settled ones
 * (paid/rejected/cancelled) are history. Contributor display names come from
 * profiles; emails are resolved by the trusted server via the auth admin API.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const scope = params.get('scope') ?? 'active';

  let statuses: string[];
  if (scope === 'active') {
    statuses = ['requested', 'under_review', 'approved', 'processing'];
  } else if (scope === 'settled') {
    statuses = ['paid', 'rejected', 'cancelled'];
  } else {
    return NextResponse.json({ error: 'Scope must be active or settled.' }, { status: 400 });
  }

  const requestedLimit = Number(params.get('limit') ?? '50');
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

  const { data: rows, error } = await db()
    .from('reward_redemptions')
    .select('id, contributor_id, amount, unit, status, payout_reference, decision_reason, requested_at, decided_at, reviewed_by')
    .in('status', statuses)
    .order('requested_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Payout queue query failed:', error.code);
    return NextResponse.json({ error: 'Could not load the payout queue.' }, { status: 500 });
  }

  const redemptions = rows ?? [];

  // Resolve contributor identity for the owner's view.
  const contributorIds = [...new Set(redemptions.map((r) => r.contributor_id))];
  const profilesById = new Map<string, { display_name: string; account_status: string }>();
  if (contributorIds.length > 0) {
    const { data: profiles, error: profilesError } = await db()
      .from('profiles')
      .select('user_id, display_name, account_status')
      .in('user_id', contributorIds);
    if (!profilesError) {
      for (const profile of profiles ?? []) {
        profilesById.set(profile.user_id, { display_name: profile.display_name, account_status: profile.account_status });
      }
    }
  }

  const emailById = await resolveUserEmails(contributorIds);

  return NextResponse.json({
    payouts: redemptions.map((row) => ({
      id: row.id,
      contributorId: row.contributor_id,
      contributorEmail: emailById.get(row.contributor_id) ?? null,
      contributorName: profilesById.get(row.contributor_id)?.display_name ?? 'Contributor',
      contributorStatus: profilesById.get(row.contributor_id)?.account_status ?? 'unknown',
      amount: Number(row.amount),
      unit: row.unit,
      status: row.status,
      payout_reference: row.payout_reference,
      decision_reason: row.decision_reason,
      requested_at: row.requested_at,
      decided_at: row.decided_at,
    })),
    pagination: { limit, count: redemptions.length },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Owner review of a payout request. The decision RPC re-verifies the admin
 * allowlist, locks the redemption row, validates the transition, and (on pay)
 * posts the immutable ledger debit — all in one transaction.
 */
export async function PATCH(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return jsonError('Request origin is not allowed.', 403);
  }

  const auth = await requireAdmin(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  try {
    const limit = await consumeRateLimit('payout-decision-admin', auth.user.id, 60, 60);
    if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  } catch {
    return jsonError('This action is temporarily unavailable. Please retry shortly.', 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid request body.', 400);
  }

  const payload = body as Record<string, unknown>;
  const redemptionId = payload['redemptionId'];
  const decision = payload['decision'];

  if (!isUuid(redemptionId)) return jsonError('A valid redemptionId is required.', 400);
  if (typeof decision !== 'string' || !['pay', 'process', 'reject'].includes(decision)) {
    return jsonError('Decision must be pay, process, or reject.', 400);
  }

  const reason = cleanText(payload['reason'], 500);
  const reference = cleanText(payload['payoutReference'], 200);
  if (decision === 'reject' && !reason) {
    return jsonError('Rejecting a payout requires a recorded reason.', 400);
  }

  const { data, error } = await db().rpc('review_linkdrop_redemption', {
    p_redemption_id: redemptionId,
    p_reviewer_id: auth.user.id,
    p_decision: decision,
    p_decision_reason: reason,
    p_payout_reference: reference,
  });

  if (error) {
    console.error('Payout decision RPC failed:', error.code);
    if (error.code === 'P0002') return jsonError('Payout request was not found.', 404);
    if (error.code === '55000') return jsonError('This payout request has already been settled.', 409);
    if (error.code === '42501') return jsonError('Administrator permission was denied.', 403);
    if (error.code === '22023') return jsonError('The decision is not valid for this request.', 400);
    return jsonError('Could not process the payout decision.', 500);
  }

  return NextResponse.json({ ok: true, result: data });
}

/** Resolves emails through the trusted server (auth admin API), page by page. */
async function resolveUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (userIds.length === 0) return emails;

  const wanted = new Set(userIds);
  for (let page = 1; page <= 5 && wanted.size > 0; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('Auth user listing failed:', error.code);
      break;
    }
    for (const user of data.users) {
      if (wanted.has(user.id) && typeof user.email === 'string') {
        emails.set(user.id, user.email);
        wanted.delete(user.id);
      }
    }
    if ((data.users ?? []).length < 200) break;
  }
  return emails;
}
