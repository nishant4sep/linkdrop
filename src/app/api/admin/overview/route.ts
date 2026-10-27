import { db, jsonError, requireAdmin } from '@/lib/server';
import { fetchLeaderboard, fetchPublicStats } from '@/lib/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-shot metrics pull for the console Overview tab: directory health,
 * the promo pipeline, and report volume. Every number is a real query —
 * any count that cannot be computed reads as null and renders as an
 * em-dash in the console. Demo rows are excluded on the RPC paths that
 * already exclude them.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const [stats, board] = await Promise.all([fetchPublicStats(), fetchLeaderboard(50)]);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [hiddenResources, pendingPromos, approvedPromos, reportsLast24h, attributedLiveResources] = await Promise.all([
    (async () => {
      try {
        const { count, error } = await db()
          .from('resources')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'disputed')
          .eq('is_demo', false);
        return error || count === null ? null : count;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { count, error } = await db()
          .from('promotion_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        return error || count === null ? null : count;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { count, error } = await db()
          .from('promotion_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved');
        return error || count === null ? null : count;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { count, error } = await db()
          .from('resource_reports')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', dayAgo);
        return error || count === null ? null : count;
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { count, error } = await db()
          .from('resources')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('is_demo', false)
          .not('submitted_by', 'is', null);
        return error || count === null ? null : count;
      } catch {
        return null;
      }
    })(),
  ]);

  return Response.json({
    ok: true,
    metrics: {
      activeResources: stats.ok ? stats.activeResources : null,
      postsCovered: stats.ok ? stats.postsCovered : null,
      lastAddedAt: stats.ok ? stats.lastAddedAt : null,
      attributedLiveResources,
      hiddenResources,
      pendingPromos,
      approvedPromos,
      reportsLast24h,
      leaderboardTop: board.ok ? board.rows.slice(0, 3).map((row) => ({ position: row.position, username: row.username, liveLinks: row.liveLinks })) : null,
    },
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
