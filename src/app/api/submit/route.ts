import {
  db,
  jsonError,
  normalizeInstagramPost,
  requireUser,
  requestOriginAllowed,
  validateResourceUrl
} from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['preset', 'template', 'pdf', 'project_file', 'tutorial', 'other']);

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return jsonError('Request origin is not allowed.', 403);

  const auth = await requireUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Send a valid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid submission.', 400);
  }

  const input = body as Record<string, unknown>;
  const post = normalizeInstagramPost(input.postUrl);
  const resourceUrl = validateResourceUrl(input.resourceUrl);
  const resourceType = cleanText(input.resourceType, 40);
  const description = typeof input.description === 'string' ? input.description.trim() : '';

  if (!post) return jsonError('Provide a supported Instagram post or Reel URL.', 400);
  if (!resourceUrl) return jsonError('Provide a valid HTTPS resource URL.', 400);
  if (!resourceType || !ALLOWED_TYPES.has(resourceType)) return jsonError('Choose a supported resource type.', 400);
  if (description.length > 500) return jsonError('Description must be 500 characters or fewer.', 400);

  try {
    const limit = await consumeRateLimit('submission-user', auth.user.id, 10, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.resetAt);

    const client = db();
    const { data: postRow, error: postError } = await client
      .from('posts')
      .upsert({
        platform: 'instagram',
        canonical_url: post.canonicalUrl,
        platform_post_id: post.postCode
      }, { onConflict: 'platform,canonical_url', ignoreDuplicates: false })
      .select('id, canonical_url')
      .single();

    if (postError || !postRow) {
      console.error('Instagram post upsert failed:', postError?.code);
      return jsonError('The Instagram post could not be registered right now.', 500);
    }

    const { data: activeMatch, error: activeError } = await client
      .from('resources')
      .select('id')
      .eq('post_id', postRow.id)
      .eq('normalized_resource_url', resourceUrl)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (activeError) return jsonError('Duplicate checking is temporarily unavailable.', 500);
    if (activeMatch) {
      return Response.json({ ok: true, status: 'already_listed', message: 'This resource is already listed for that post.' });
    }

    const { data: pendingMatch, error: pendingError } = await client
      .from('submissions')
      .select('id')
      .eq('post_id', postRow.id)
      .eq('normalized_resource_url', resourceUrl)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    if (pendingError) return jsonError('Duplicate checking is temporarily unavailable.', 500);
    if (pendingMatch) {
      return Response.json({ ok: true, status: 'already_pending', message: 'This resource is already awaiting review.' });
    }

    // Keep legacy required columns populated until the old schema is fully retired.
    const { data: submission, error: insertError } = await client
      .from('submissions')
      .insert({
        post_id: postRow.id,
        submitted_by: auth.user.id,
        resource_url: resourceUrl,
        normalized_resource_url: resourceUrl,
        resource_type: resourceType,
        description: description || null,
        status: 'pending',
        resource_id: null,
        verification_method: 'community_submission',
        moderation_status: 'pending'
      })
      .select('id, status, created_at')
      .single();

    if (insertError?.code === '23505') {
      return Response.json({ ok: true, status: 'already_pending', message: 'This resource has already been submitted.' });
    }
    if (insertError || !submission) {
      console.error('Submission insert failed:', insertError?.code);
      return jsonError('The submission could not be saved right now.', 500);
    }

    return Response.json({
      ok: true,
      submission: { id: submission.id, status: submission.status, createdAt: submission.created_at },
      message: 'Submission received. It will not appear publicly until it passes review.'
    }, { status: 201, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('Submission handler failed:', error);
    return jsonError('The submission could not be saved right now.', 500);
  }
}
