/**
 * Pure URL validation helpers. Intentionally dependency-free so they can be
 * tested and imported without the Supabase server client or `server-only`.
 */

/**
 * Normalizes a public Instagram post or Reel URL into a canonical form.
 * Returns null for anything that isn't a supported instagram.com shortcode URL.
 */
export function normalizeInstagramPost(input: unknown): { canonicalUrl: string; postCode: string } | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'instagram.com') return null;
  const match = url.pathname.match(/^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})\/?$/i);
  if (!match) return null;
  return {
    canonicalUrl: `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/`,
    postCode: match[2]
  };
}

/**
 * Validates a destination resource URL without fetching it. Reachability is not
 * proof of legitimacy. Returns the normalized URL string or null.
 */
export function validateResourceUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 4096) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (!url.hostname || url.hostname.length > 253 || (url.port && url.port !== '443')) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) ||
    /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) return null;
  url.hash = '';
  return url.toString();
}
