import 'server-only';

import { db } from '@/lib/server';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

/**
 * Uses an atomic database RPC so limits remain consistent across server instances.
 * The bucket identifier is namespaced and never accepts a raw client IP header.
 */
export async function consumeRateLimit(
  namespace: string,
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!/^[a-z0-9-]{1,48}$/i.test(namespace)) throw new Error('Invalid rate-limit namespace.');
  if (!identifier || identifier.length > 140) throw new Error('Invalid rate-limit identifier.');
  if (!Number.isInteger(maxRequests) || !Number.isInteger(windowSeconds)) throw new Error('Invalid rate-limit settings.');

  const bucketKey = `${namespace}:${identifier}`;
  const { data, error } = await db().rpc('consume_rate_limit', {
    p_bucket_key: bucketKey,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds
  });

  if (error) {
    console.error('Rate-limit RPC failed:', error.code);
    throw new Error('Rate limiting is temporarily unavailable.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== 'boolean' || typeof row.reset_at !== 'string') {
    throw new Error('Rate-limit RPC returned an unexpected result.');
  }

  return {
    allowed: row.allowed,
    remaining: Number(row.remaining ?? 0),
    resetAt: row.reset_at
  };
}

export function rateLimitResponse(resetAt: string): Response {
  const resetMs = Date.parse(resetAt);
  const retryAfter = Number.isFinite(resetMs)
    ? Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))
    : 60;

  return Response.json(
    { ok: false, error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    }
  );
}
