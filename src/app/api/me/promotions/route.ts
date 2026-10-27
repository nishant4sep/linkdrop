import { db, jsonError, requireUser } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { honeypotTripped } from '@/lib/ip';
import { PROMO_DETAIL_MAX, PROMO_HEADLINE_MAX } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The contributor side of the promotion flow:
 *   GET  → own requests + live eligibility (rank, live links, eligible flag)
 *   POST → submit a promotion request (eligibility is enforced IN the database
 *          by submit_promotion, so the UI can never grant it by accident).
 */

type PromotionRequest = {
  id: string;
  headline: string;
  detail: string | null;
  target_url: string;
  status: string;
  owner_note: string | null;
  active_until: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db()
    .from('promotion_requests')
    .select('id, headline, detail, target_url, status, owner_note, active_until, created_at, reviewed_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Promotion history lookup failed:', error.code);
    return jsonError('Your promotion history could not be loaded.', 500);
  }

  let eligibility: { rank: number | null; liveLinks: number; eligible: boolean } | null = null;
  try {
    const { data: rankData, error: rankError } = await db().rpc('contributor_rank', { p_user_id: auth.user.id });
    if (!rankError && rankData) {
      const payload = (Array.isArray(rankData) ? rankData[0] : rankData) as {
        rank?: number | null;
        liveLinks?: number | null;
        eligible?: boolean | null;
      } | null;
      if (payload) {
        eligibility = {
          rank: typeof payload.rank === 'number' ? payload.rank : null,
          liveLinks: Number(payload.liveLinks ?? 0),
          eligible: payload.eligible === true,
        };
      }
    }
  } catch (rankFailure) {
    console.error('Eligibility lookup failed:', rankFailure);
  }

  const requests = ((data ?? []) as PromotionRequest[]).map((row) => ({
    id: row.id,
    headline: row.headline,
    detail: row.detail,
    targetUrl: row.target_url,
    status: row.status,
    ownerNote: row.owner_note,
    activeUntil: row.active_until,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));

  return Response.json({
    ok: true,
    eligibility,
    requests,
    hasPending: requests.some((row) => row.status === 'pending'),
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Send a valid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid request.', 400);
  }
  const input = body as Record<string, unknown>;
  if (honeypotTripped(input['company'])) {
    return jsonError('Request rejected.', 400);
  }

  try {
    const bucket = await consumeRateLimit('promo-submit-user', auth.user.id, 3, 86400);
    if (!bucket.allowed) return rateLimitResponse(bucket.resetAt);
  } catch {
    return jsonError('Limiting service is unavailable. Please retry shortly.', 503);
  }

  const headline = typeof input['headline'] === 'string' ? input['headline'].trim().replace(/\s+/g, ' ') : '';
  const detail = typeof input['detail'] === 'string' ? input['detail'].trim().replace(/\s+/g, ' ') : '';
  const targetUrl = typeof input['targetUrl'] === 'string' ? input['targetUrl'].trim() : '';

  if (headline.length < 1 || headline.length > PROMO_HEADLINE_MAX) {
    return jsonError(`The headline must be 1–${PROMO_HEADLINE_MAX} characters.`, 400);
  }
  if (detail.length > PROMO_DETAIL_MAX) {
    return jsonError(`Keep the optional detail under ${PROMO_DETAIL_MAX} characters.`, 400);
  }
  if (!/^https:\/\//i.test(targetUrl) || targetUrl.length > 2000) {
    return jsonError('Paste a direct https:// URL the ad should open.', 400);
  }

  try {
    const { data, error } = await db().rpc('submit_promotion', {
      p_user_id: auth.user.id,
      p_headline: headline,
      p_detail: detail || null,
      p_target_url: targetUrl,
    });
    if (error) {
      console.error('submit_promotion RPC failed:', error.code);
      return jsonError('Your promotion request could not be recorded right now.', 500);
    }
    const result = (Array.isArray(data) ? data[0] : data) as { status?: string } | null;
    switch (result?.status) {
      case 'submitted':
        return Response.json({
          ok: true,
          status: 'submitted',
          message: 'Sent to the owner. If it passes review it goes live in your sponsored slot for about a day — and any day you are back on top.',
        }, { status: 201, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      case 'already_pending':
        return jsonError('You already have a promotion waiting for owner review.', 409);
      case 'already_live':
        return jsonError('Your promotion is already live.', 409);
      case 'not_eligible':
        return jsonError('You are not currently on top of the leaderboard, so promotion is locked.', 403);
      default:
        return jsonError('Your promotion request could not be recorded right now.', 500);
    }
  } catch (failure) {
    console.error('Promotion submission failed:', failure);
    return jsonError('Your promotion request could not be recorded right now.', 500);
  }
}
