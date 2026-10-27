import { db, jsonError, normalizeInstagramPost, validateResourceUrl } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { clientIpHash, honeypotTripped } from '@/lib/ip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set([
  'preset', 'template', 'pdf', 'document', 'project_file', 'software', 'course', 'tutorial', 'other',
]);

async function turnstileOk(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  if (!secret) return true; // not configured → skipped for now (phase-2 switch)
  if (typeof token !== 'string' || !token) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const payload = await response.json() as { success?: boolean };
    return payload.success === true;
  } catch {
    return false; // configured but unreachable → fail closed
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
    });

    if (error) {
      console.error('Public submit RPC failed:', error.code);
      if (error.code === '55000') {
        return jsonError('Publishing is paused—no review team is configured yet.', 503);
      }
      return jsonError('The link could not be published right now.', 500);
    }

    const result = data as { status?: string; resourceId?: string } | null;
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
      postCode: post.postCode,
      postUrl: post.canonicalUrl,
      message: 'Published. It is live on that post\u2019s page right now—thanks for sharing!',
    }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    console.error('Public submit failed:', error);
    return jsonError('The link could not be published right now.', 500);
  }
}
