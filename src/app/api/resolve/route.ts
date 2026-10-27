import { db, jsonError, normalizeInstagramPost } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Send a valid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || !('url' in body)) {
    return jsonError('Provide an Instagram Reel or post URL.', 400);
  }

  const parsed = normalizeInstagramPost((body as { url: unknown }).url);
  if (!parsed) return jsonError('That URL is not a supported Instagram post or Reel URL.', 400);

  try {
    const limit = await consumeRateLimit('resolver-post', parsed.postCode, 120, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  } catch {
    return jsonError('The resolver is temporarily unavailable. Please retry shortly.', 503);
  }

  try {
    const client = db();
    const { data: post, error: postError } = await client
      .from('posts')
      .select('id, canonical_url')
      .eq('canonical_url', parsed.canonicalUrl)
      .maybeSingle();

    if (postError) {
      console.error('Post lookup failed:', postError.code);
      return jsonError('The resource lookup is temporarily unavailable.', 500);
    }

    const headers = {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Content-Type-Options': 'nosniff'
    };

    if (!post) {
      return Response.json({
        ok: true,
        postUrl: parsed.canonicalUrl,
        postCode: parsed.postCode,
        resources: [],
        message: 'No resource is listed for this post yet. Be the first to add it below.'
      }, { headers });
    }

    const { data: resources, error: resourcesError } = await client
      .from('resources')
      .select('id, resource_url, resource_type, description, created_at')
      .eq('post_id', post.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);

    if (resourcesError) {
      console.error('Active resource lookup failed:', resourcesError.code);
      return jsonError('The resource lookup is temporarily unavailable.', 500);
    }

    return Response.json({
      ok: true,
      postUrl: parsed.canonicalUrl,
      postCode: parsed.postCode,
      resources: (resources ?? []).map((resource) => ({
        id: resource.id,
        url: resource.resource_url,
        type: resource.resource_type,
        description: resource.description,
        addedAt: resource.created_at
      })),
      message: resources?.length
        ? 'Community-shared resource. Something wrong? Use Report on the card.'
        : 'No resource is listed for this post yet. Be the first to add it below.'
    }, { headers });
  } catch (error) {
    console.error('Resolve request failed:', error);
    return jsonError('The resource lookup is temporarily unavailable.', 500);
  }
}
