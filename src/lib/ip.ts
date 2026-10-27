import 'server-only';

import { createHash } from 'node:crypto';

/**
 * Extracts a client IP from the request and reduces it to a salted hash.
 *
 * We never store raw IPs: reports and submissions keep only
 * sha256(salt | '|' | ip). The salt uses the service-role key (only ever on
 * the server) unless IP_HASH_SALT provides a dedicated value, so rotating
 * that key intentionally resets anonymous identity tracking.
 *
 * X-Forwarded-For is read from the LAST entry because the leftmost value is
 * client-controllable behind CDN proxies, while the last value is added by
 * the nearest trusted proxy.
 */
export function clientIpHash(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const raw = (forwarded ? forwarded.split(',').map((part) => part.trim()).filter(Boolean).pop() : undefined)
    ?? realIp?.trim()
    ?? null;

  if (!raw) return null;

  const salt = process.env.IP_HASH_SALT?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || 'linkdrop-local-development-salt';
  return createHash('sha256').update(`${salt}|${raw}`).digest('hex').slice(0, 64);
}

/** True when the honeypot field was filled — bots do, humans don't. */
export function honeypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
