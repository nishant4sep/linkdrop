import { isUuid, db, jsonError, requireAdmin } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Owner console for promotion requests:
 *   GET   → pending queue + currently live + recent history, with usernames.
 *   PATCH → approve (24h window), reject, retire, or extend via the
 *           admin_promotion_decide RPC (which enforces admin rights in SQL
 *           again and writes the audit trail).
 */

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db()
    .from('promotion_requests')
    .select('id, user_id, headline, detail, target_url, status, owner_note, active_until, created_at, reviewed_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Promotion queue lookup failed:', error.code);
    return jsonError('The promotion queue could not be loaded.', 500);
  }

  // Resolve usernames + current live counts for context.
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(isUuid))] as string[];

  let usernameByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await db()
      .from('profiles')
      .select('user_id, username')
      .in('user_id', userIds);
    if (!profilesError) {
      usernameByUser = new Map(
        ((profiles ?? []) as Array<{ user_id: string; username: string | null }>)
          .filter((row) => row.username)
          .map((row) => [row.user_id, row.username as string]),
      );
    }
  }

  const rankByUser = new Map<string, { rank: number | null; liveLinks: number; eligible: boolean }>();
  for (const userId of userIds) {
    try {
      const { data: rankData, error: rankError } = await db().rpc('contributor_rank', { p_user_id: userId });
      if (!rankError && rankData) {
        const payload = (Array.isArray(rankData) ? rankData[0] : rankData) as {
          rank?: number | null;
          liveLinks?: number | null;
          eligible?: boolean | null;
        } | null;
        rankByUser.set(userId, {
          rank: typeof payload?.rank === 'number' ? payload.rank : null,
          liveLinks: Number(payload?.liveLinks ?? 0),
          eligible: payload?.eligible === true,
        });
      }
    } catch (rankFailure) {
      console.error('Rank lookup failed for a promotion row:', rankFailure);
    }
  }

  const withUser = rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    username: usernameByUser.get(String(row.user_id)) ?? '(no username)',
    rank: rankByUser.get(String(row.user_id)) ?? null,
    headline: String(row.headline),
    detail: (row.detail as string | null) ?? null,
    targetUrl: String(row.target_url),
    status: String(row.status),
    ownerNote: (row.owner_note as string | null) ?? null,
    activeUntil: (row.active_until as string | null) ?? null,
    createdAt: String(row.created_at),
    reviewedAt: (row.reviewed_at as string | null) ?? null,
  }));

  return Response.json({
    ok: true,
    pending: withUser.filter((row) => row.status === 'pending'),
    approved: withUser.filter((row) => row.status === 'approved'),
    history: withUser.filter((row) => row.status === 'rejected' || row.status === 'retired'),
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
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
  const requestId = input['requestId'];
  if (!isUuid(requestId)) {
    return jsonError('A valid requestId is required.', 400);
  }
  const action = input['action'];
  if (typeof action !== 'string' || !['approve', 'reject', 'retire', 'extend'].includes(action)) {
    return jsonError('Unknown action.', 400);
  }
  const note = typeof input['note'] === 'string' ? input['note'].trim() : '';
  const hoursRaw = Number(input['hours']);
  const hours = Number.isInteger(hoursRaw) && hoursRaw >= 1 ? hoursRaw : 24;

  try {
    const { data, error } = await db().rpc('admin_promotion_decide', {
      p_request_id: requestId,
      p_reviewer_id: auth.user.id,
      p_action: action,
      p_note: note || null,
      p_hours: hours,
    });
    if (error) {
      console.error('admin_promotion_decide RPC failed:', error.code);
      return jsonError('The decision could not be saved right now.', 500);
    }
    const result = (Array.isArray(data) ? data[0] : data) as { status?: string; activeUntil?: string | null } | null;
    return Response.json({
      ok: true,
      action: result?.status ?? action,
      activeUntil: result?.activeUntil ?? null,
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (failure) {
    console.error('Promotion decision failed:', failure);
    return jsonError('The decision could not be saved right now.', 500);
  }
}
