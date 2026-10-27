import { db, jsonError, requireUser } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data: profile, error: profileError } = await db()
    .from('profiles')
    .select('display_name, username, account_status, created_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Profile lookup failed:', profileError.message);
    return jsonError('Your profile could not be loaded.', 500);
  }

  // Live leaderboard position (null/absent when no username or no live links).
  let rankInfo: { rank: number | null; liveLinks: number; eligible: boolean } | null = null;
  if (profile?.username) {
    try {
      const { data, error: rankError } = await db().rpc('contributor_rank', { p_user_id: auth.user.id });
      if (!rankError && data) {
        const payload = (Array.isArray(data) ? data[0] : data) as {
          rank?: number | null;
          liveLinks?: number | null;
          eligible?: boolean | null;
        } | null;
        if (payload) {
          rankInfo = {
            rank: typeof payload.rank === 'number' ? payload.rank : null,
            liveLinks: Number(payload.liveLinks ?? 0),
            eligible: payload.eligible === true,
          };
        }
      }
    } catch (rankFailure) {
      console.error('Contributor rank lookup failed:', rankFailure);
    }
  }

  return Response.json({
    ok: true,
    profile: {
      id: auth.user.id,
      email: auth.user.email ?? '',
      display_name: profile?.display_name ?? 'Contributor',
      username: profile?.username ?? null,
      account_status: profile?.account_status ?? 'active',
      member_since: profile?.created_at ?? auth.user.created_at,
    },
    rank: rankInfo,
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}