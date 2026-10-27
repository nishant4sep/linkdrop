import 'server-only';

/**
 * Cloudflare Turnstile verification, shared by every public write path.
 *
 * Policy: when TURNSTILE_SECRET is NOT configured the check is skipped (the
 * site stays usable); when configured, a missing/failed/unreachable token
 * FAILS CLOSED. Nothing here trusts the client beyond the signed token the
 * widget provides.
 */
export async function turnstileOk(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  if (!secret) return true; // not configured → skipped for now
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
