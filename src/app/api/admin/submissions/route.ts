import { NextRequest, NextResponse } from 'next/server';
import { db, requireAdmin, requestOriginAllowed } from '@/lib/server';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected']);
const ALLOWED_DECISIONS = new Set(['approve', 'reject']);
const MAX_LIMIT = 100;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Admin moderation queue. Canonical Instagram URLs are fetched from posts in a
 * second query so this endpoint does not depend on a guessed PostgREST relation
 * name or foreign-key constraint alias.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  const params = request.nextUrl.searchParams;
  const requestedStatus = params.get('status') ?? 'pending';
  if (!ALLOWED_STATUSES.has(requestedStatus)) {
    return errorResponse('Invalid status filter.', 400);
  }

  const requestedLimit = Number(params.get('limit') ?? '50');
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return errorResponse('Limit must be an integer between 1 and 100.', 400);
  }
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const { data: rows, error: queueError } = await db()
    .from('submissions')
    .select('id, post_id, submitted_by, resource_url, normalized_resource_url, resource_type, description, status, created_at')
    .eq('status', requestedStatus)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (queueError) {
    console.error('Admin queue query failed:', queueError.code);
    return errorResponse('Could not load the moderation queue.', 500);
  }

  const submissions = rows ?? [];
  const postIds = [...new Set(submissions.map((row) => row.post_id).filter(Boolean))];
  const postUrlById = new Map<string, string>();

  if (postIds.length > 0) {
    const { data: posts, error: postsError } = await db()
      .from('posts')
      .select('id, canonical_url')
      .in('id', postIds);

    if (postsError) {
      console.error('Admin queue post lookup failed:', postsError.code);
      return errorResponse('Could not load Instagram post links for the queue.', 500);
    }

    for (const post of posts ?? []) {
      if (typeof post.canonical_url === 'string') {
        postUrlById.set(post.id, post.canonical_url);
      }
    }
  }

  return NextResponse.json({
    submissions: submissions.map((submission) => ({
      ...submission,
      canonical_url: postUrlById.get(submission.post_id) ?? null,
    })),
    pagination: { limit, count: submissions.length },
  });
}

export async function PATCH(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return errorResponse('Request origin is not allowed.', 403);
  }

  const auth = await requireAdmin(request);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Invalid request body.', 400);
  }

  const payload = body as Record<string, unknown>;
  const submissionId = payload.submissionId;
  const decision = payload.decision;
  const reviewNote = payload.reviewNote;

  if (!isUuid(submissionId)) {
    return errorResponse('A valid submissionId is required.', 400);
  }
  if (typeof decision !== 'string' || !ALLOWED_DECISIONS.has(decision)) {
    return errorResponse('Decision must be approve or reject.', 400);
  }
  if (reviewNote !== undefined && reviewNote !== null && typeof reviewNote !== 'string') {
    return errorResponse('reviewNote must be a string.', 400);
  }
  if (typeof reviewNote === 'string' && reviewNote.length > 2000) {
    return errorResponse('reviewNote must be 2000 characters or fewer.', 400);
  }

  const { data, error } = await db().rpc('review_linkdrop_submission', {
    p_submission_id: submissionId,
    p_reviewer_id: auth.user.id,
    p_decision: decision,
    p_review_note: typeof reviewNote === 'string' ? reviewNote.trim() || null : null,
  });

  if (error) {
    console.error('Atomic moderation RPC failed:', error.code);
    if (error.code === 'P0002') return errorResponse('Submission was not found.', 404);
    if (error.code === '23505') return errorResponse('A matching published resource already exists.', 409);
    if (error.code === '42501') return errorResponse('Administrator permission was denied.', 403);
    if (error.code === '22023') return errorResponse('The moderation decision is invalid for this submission.', 409);
    return errorResponse('Could not process the moderation decision.', 500);
  }

  return NextResponse.json({ ok: true, result: data });
}
