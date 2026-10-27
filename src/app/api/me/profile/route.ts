import { db, jsonError, requireUser } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data: profile, error: profileError } = await db()
    .from('profiles')
    .select('display_name, account_status, created_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Profile lookup failed:', profileError.message);
    return jsonError('Your profile could not be loaded.', 500);
  }

  return Response.json({
    ok: true,
    profile: {
      id: auth.user.id,
      email: auth.user.email ?? '',
      display_name: profile?.display_name ?? 'Contributor',
      account_status: profile?.account_status ?? 'active',
      member_since: profile?.created_at ?? auth.user.created_at,
    },
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}