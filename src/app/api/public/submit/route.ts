import { db, jsonError, normalizeInstagramPost, validateResourceUrl } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { clientIpHash, honeypotTripped } from '@/lib/ip';
import { turnstileOk } from '@/lib/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set([
  'preset', 'template', 'pdf', 'document', 'project_file', 'software', 'course', 'tutorial', 'other',
]);

/**
 * Optional attribution: when the browser sends a session token, the submission
 * is published exactly the same way, but credited to the account (which makes
 * it count on the live leaderboard). A broken/invalid token fails loudly so the
 * contributor never silently loses credit.
 */
async function optionalSubmitterId(request: Request): Promise<{ id: string | null; error?: string; status?: number }> {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  if (!match) return { id: null };
  try {
    const { data, error } = await db().auth.getUser(match[1]);
    if (error || !data.user) return { id: null, error: 'Your session expired — sign in again to keep earning credit.', status: 401 };

    const { data: profile, error: profileError } = await db()
      .from('profiles')
      .select('account_status, username')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (profileError) return { id: null, error: 'Your account could not be verified. Retry shortly.', status: 503 };
    if (profile && profile.account_status !== 'active') {
      return { id: null, error: 'This account is not active.', status: 403 };
    }
    if (!profile?.username) {
      return { id: null, error: 'This account has no username yet — leaderboard credit will not attach. Ask the owner to add one.', status: 403 };
    }
    return { id: data.user.id };
  } catch {
    return { id: null, error: 'Your account could not be verified. Retry shortly.', status: 503 };
  }
}

/**
 * Anonymous instant-publish endpoint (the 2026-10-27 pivot).
 * Anti-abuse layers: honeypot, per-IP and global rate limits, optional
 * Turnstile, IP stored only as a salted hash, DB-side duplicate protection,
 * and one-report auto-quarantine so anything rotten vanishes in seconds.
 */
export async function POST(request: Request) {
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
  if (honeypotTripped(input['company'])) {
    return jsonError('Submission rejected.', 400);
  }

  const ipHash = clientIpHash(request);
  if (!ipHash) {
    return jsonError('Your connection does not expose an address we can rate-limit. Submission blocked.', 403);
  }

  try {
    const perIp = await consumeRateLimit('public-submit-ip', ipHash, 5, 3600);
    if (!perIp.allowed) return rateLimitResponse(perIp.resetAt);
    const globalBucket = await consumeRateLimit('public-submit-global', 'site-wide', 120, 3600);
    if (!globalBucket.allowed) {
      return jsonError('LinkDrop is receiving too many submissions right now. Try again in a bit.', 429);
    }
  } catch {
    return jsonError('Limiting service is unavailable. Please retry shortly.', 503);
  }

  const submitter = await optionalSubmitterId(request);
  if (submitter.error) {
    return jsonError(submitter.error, submitter.status ?? 401);
  }

  const post = normalizeInstagramPost(input['postUrl']);
  const resourceUrl = validateResourceUrl(input['resourceUrl']);
  const type = typeof input['resourceType'] === 'string' ? input['resourceType'] : '';
  const description = typeof input['description'] === 'string' ? input['description'].trim() : '';

  if (!post) return jsonError('Provide a supported Instagram post or Reel URL.', 400);
  if (!resourceUrl) return jsonError('Provide a valid HTTPS resource URL.', 400);
  if (!ALLOWED_TYPES.has(type)) return jsonError('Choose a supported resource type.', 400);
  if (description.length > 500) return jsonError('Keep the description under 500 characters.', 400);

  const captcha = await turnstileOk(input['turnstileToken']);
  if (!captcha) return jsonError('The bot check failed. Please retry.', 403);

  try {
    const { data, error } = await db().rpc('submit_public_link', {
      p_canonical_post_url: post.canonicalUrl,
      p_post_code: post.postCode,
      p_platform: 'instagram',
      p_resource_url: resourceUrl,
      p_resource_type: type,
      p_description: description || null,
      p_submitter_ip_hash: ipHash,
      p_submitter_id: submitter.id,
    });

    if (error) {
      console.error('Public submit RPC failed:', error.code);
      if (error.code === '55000') {
        return jsonError('Publishing is paused—no review team is configured yet.', 503);
      }
      return jsonError('The link could not be published right now.', 500);
    }

    const result = data as { status?: string; resourceId?: string; attributed?: boolean | null } | null;
    if (result?.status === 'already_listed') {
      return jsonError('That resource is already listed for this post.', 409);
    }
    if (result?.status === 'on_hold') {
      return jsonError('A version of this link is already held after a report. The review team will decide it.', 409);
    }

    return Response.json({
      ok: true,
      status: 'published',
      resourceId: result?.resourceId ?? null,
      attributed: result?.attributed === true,
      postCode: post.postCode,
      postUrl: post.canonicalUrl,
      message: result?.attributed === true
        ? 'Published live, and it counts toward your leaderboard rank. Nice one!'
        : 'Published. It is live on that post\u2019s page right now—thanks for sharing!',
    }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    console.error('Public submit failed:', error);
    return jsonError('The link could not be published right now.', 500);
  }
}
