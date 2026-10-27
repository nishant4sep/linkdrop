import { db, jsonError, requireUser } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;

  const { data, error } = await db()
    .from('submissions')
    .select('id, post_id, resource_url, normalized_resource_url, resource_type, description, status, created_at')
    .eq('submitted_by', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Contributor submission history failed:', error.message);
    return jsonError('Your submission history could not be loaded.', 500);
  }

  const postIds = [...new Set((data ?? []).map((row) => row.post_id))];
  let postUrlById = new Map<string, string>();
  if (postIds.length) {
    const { data: posts, error: postsError } = await db()
      .from('posts')
      .select('id, canonical_url')
      .in('id', postIds);

    if (postsError) {
      console.error('Contributor post URL lookup failed:', postsError.message);
      return jsonError('Your submission history could not be loaded.', 500);
    }
    postUrlById = new Map((posts ?? []).map((post) => [post.id, post.canonical_url]));
  }

  return Response.json({
    ok: true,
    submissions: (data ?? []).map((row) => ({
      id: row.id,
      postUrl: postUrlById.get(row.post_id) ?? null,
      resourceUrl: row.normalized_resource_url,
      resourceType: row.resource_type,
      description: row.description,
      status: row.status,
      createdAt: row.created_at
    }))
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
