import { db, jsonError } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { clientIpHash, honeypotTripped } from '@/lib/ip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASONS = new Set(['fraud', 'dead_link', 'explicit', 'copyright', 'other']);

/**
 * Anonymous report of a resource. One report from a distinct IP immediately
 * quarantines the resource ("disputed"); all reports land in the owner
 * console. Each visitor can report a resource only once (unique DB index).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Send a valid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid report.', 400);
  }

  const input = body as Record<string, unknown>;
  if (honeypotTripped(input['company'])) {
    return jsonError('Report rejected.', 400);
  }

  const ipHash = clientIpHash(request);
  if (!ipHash) {
    return jsonError('Your connection does not expose an address we can rate-limit. Report blocked.', 403);
  }

  try {
    const perIp = await consumeRateLimit('report-ip', ipHash, 10, 3600);
    if (!perIp.allowed) return rateLimitResponse(perIp.resetAt);
  } catch {
    return jsonError('Limiting service is unavailable. Please retry shortly.', 503);
  }

  const resourceId = input['resourceId'];
  const reason = input['reason'];
  const details = typeof input['details'] === 'string' ? input['details'].trim() : '';

  if (typeof resourceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resourceId)) {
    return jsonError('Provide the resource being reported.', 400);
  }
  if (typeof reason !== 'string' || !REASONS.has(reason)) {
    return jsonError('Choose a report reason.', 400);
  }
  if (details.length > 500) {
    return jsonError('Keep extra details under 500 characters.', 400);
  }

  try {
    const { data, error } = await db().rpc('report_resource', {
      p_resource_id: resourceId,
      p_reporter_id: null,
      p_reporter_ip_hash: ipHash,
      p_reason: reason,
      p_details: details || null,
    });

    if (error) {
      console.error('Report RPC failed:', error.code);
      if (error.code === 'P0002') return jsonError('That resource no longer exists.', 404);
      return jsonError('The report could not be saved right now.', 500);
    }

    const result = data as { acknowledged?: boolean; hidden?: boolean } | null;
    return Response.json({
      ok: true,
      hidden: result?.hidden === true,
      message: result?.hidden
        ? 'Thanks \u2014 that link is now hidden while a human reviews your report.'
        : 'Thanks \u2014 your report was recorded for this link.',
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('Report failed:', error);
    return jsonError('The report could not be saved right now.', 500);
  }
}
