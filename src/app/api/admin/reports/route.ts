import { NextRequest, NextResponse } from 'next/server';
import { db, jsonError, requireAdmin } from '@/lib/server';

/**
 * Owner's reported-links queue: every quarantined ("disputed") resource with
 * its accumulated, unreviewed reports, plus decisive actions that either
 * reinstate the resource or remove it permanently.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { data: hiddenResources, error: resourcesError } = await db()
      .from('resources')
      .select('id, post_id, resource_url, resource_type, description, status, created_at, submitted_ip_hash')
      .eq('status', 'disputed')
      .order('created_at', { ascending: false })
      .limit(100);

    if (resourcesError) {
      console.error('Disputed resources query failed:', resourcesError.code);
      return NextResponse.json({ error: 'Could not load the reports queue.' }, { status: 500 });
    }

    const hidden = hiddenResources ?? [];
    if (hidden.length === 0) {
      return NextResponse.json({ reports: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const resourceIds = hidden.map((r) => r.id);
    const { data: reportRows, error: reportsError } = await db()
      .from('resource_reports')
      .select('resource_id, reason, details, status, created_at')
      .in('resource_id', resourceIds)
      .in('status', ['unread', 'reviewed', 'actioned', 'dismissed'])
      .order('created_at', { ascending: true });

    if (reportsError) {
      console.error('Reports query failed:', reportsError.code);
      return NextResponse.json({ error: 'Could not load the reports queue.' }, { status: 500 });
    }

    const postsById = new Map<string, { canonical_url: string | null; platform_post_id: string | null }>();
    const postIds = [...new Set(hidden.map((r) => r.post_id))];
    if (postIds.length > 0) {
      const { data: postRows, error: postsError } = await db()
        .from('posts')
        .select('id, canonical_url, platform_post_id')
        .in('id', postIds);
      if (postsError) {
        console.error('Reports post lookup failed:', postsError.code);
      }
      for (const post of postRows ?? []) {
        postsById.set(post.id, post);
      }
    }

    const reportsByResource = new Map<string, Array<{ reason: string; details: string | null; created_at: string }>>();
    for (const row of reportRows ?? []) {
      const list = reportsByResource.get(row.resource_id) ?? [];
      if (row.status === 'unread') {
        list.push({ reason: row.reason, details: row.details, created_at: row.created_at });
      }
      reportsByResource.set(row.resource_id, list);
    }

    return NextResponse.json({
      reports: hidden.map((r) => ({
        resourceId: r.id,
        postId: r.post_id,
        postUrl: postsById.get(r.post_id)?.canonical_url ?? null,
        postCode: postsById.get(r.post_id)?.platform_post_id ?? null,
        resourceUrl: r.resource_url,
        resourceType: r.resource_type,
        description: r.description,
        reportedAt: r.created_at,
        submitterIpHash: r.submitted_ip_hash,
        reports: (reportsByResource.get(r.id) ?? []),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Reports queue failed:', error);
    return NextResponse.json({ error: 'Could not load the reports queue.' }, { status: 500 });
  }
}

/**
 * Reinstate or permanently remove a quarantined resource. The decision RPC
 * re-verifies the admin allowlist, updates the resource, closes unread
 * reports, and writes the audit trail in one transaction.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid request body.', 400);
  }

  const payload = body as Record<string, unknown>;
  const resourceId = payload['resourceId'];
  const action = payload['action'];
  const note = typeof payload['note'] === 'string' ? payload['note'].trim().slice(0, 500) : null;

  if (typeof resourceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resourceId)) {
    return jsonError('A valid resourceId is required.', 400);
  }
  if (action !== 'reinstate' && action !== 'remove') {
    return jsonError('Action must be reinstate or remove.', 400);
  }

  const { data, error } = await db().rpc('admin_resolve_report', {
    p_resource_id: resourceId,
    p_reviewer_id: auth.user.id,
    p_action: action,
    p_note: note,
  });

  if (error) {
    console.error('Report decision RPC failed:', error.code);
    if (error.code === 'P0002') return jsonError('That resource no longer exists.', 404);
    if (error.code === '42501') return jsonError('Administrator permission was denied.', 403);
    return jsonError('Could not process the decision.', 500);
  }

  return NextResponse.json({ ok: true, result: data });
}
