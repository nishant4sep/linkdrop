import { NextRequest, NextResponse } from 'next/server';
import { db, requireAdmin } from '@/lib/server';
import { aggregateRewardState } from '@/lib/reward-math';

type LedgerStat = { entry_type: string; status: string; amount: string | number };
type RedemptionStat = { amount: string | number; status: string };

/**
 * Contributors view for the owner: account state plus per-contributor reward
 * and contribution aggregates. Emails are resolved server-side only; the
 * browser never sees auth admin data outside this allowlisted console.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { data: profiles, error: profilesError } = await db()
      .from('profiles')
      .select('user_id, display_name, account_status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (profilesError) {
      console.error('Contributors profile query failed:', profilesError.code);
      return NextResponse.json({ error: 'Could not load the contributor list.' }, { status: 500 });
    }

    const list = profiles ?? [];
    if (list.length === 0) {
      return NextResponse.json({ contributors: [], pagination: { count: 0 } }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const userIds = list.map((p) => p.user_id);

    // Per-contributor aggregates, fetched in aggregate queries (not N per user).
    const ledgerStats: LedgerStat[] = [];
    const { data: ledgerRows, error: ledgerError } = await db()
      .from('reward_ledger')
      .select('contributor_id, entry_type, status, amount')
      .in('contributor_id', userIds);
    if (ledgerError) console.error('Contributors ledger query failed:', ledgerError.code);
    for (const row of ledgerRows ?? []) {
      ledgerStats.push(row as unknown as LedgerStat);
    }

    const redemptionStats: RedemptionStat[] = [];
    const { data: redemptionRows, error: redemptionError } = await db()
      .from('reward_redemptions')
      .select('contributor_id, amount, status')
      .in('contributor_id', userIds);
    if (redemptionError) console.error('Contributors redemption query failed:', redemptionError.code);
    for (const row of redemptionRows ?? []) {
      redemptionStats.push(row as unknown as RedemptionStat);
    }

    // Per-contributor aggregates, counted in JS from id fetches (robust and small).
    const submissionCounts = new Map<string, number>();
    const { data: submittedRows, error: submissionsError } = await db()
      .from('submissions')
      .select('id, submitted_by')
      .in('submitted_by', userIds)
      .limit(5000);
    if (submissionsError) console.error('Contributors submission count failed:', submissionsError.code);
    for (const row of (submittedRows ?? []) as Array<{ submitted_by: string }>) {
      submissionCounts.set(row.submitted_by, (submissionCounts.get(row.submitted_by) ?? 0) + 1);
    }

    const approvedCounts = new Map<string, number>();
    const { data: approvedRows, error: approvedError } = await db()
      .from('submissions')
      .select('id, submitted_by')
      .in('submitted_by', userIds)
      .eq('status', 'approved')
      .limit(5000);
    if (approvedError) console.error('Contributors approved count failed:', approvedError.code);
    for (const row of (approvedRows ?? []) as Array<{ submitted_by: string }>) {
      approvedCounts.set(row.submitted_by, (approvedCounts.get(row.submitted_by) ?? 0) + 1);
    }

    const emails = await resolveUserEmails(userIds);

    const contributors = list.map((profile) => {
      const entries = ledgerStats
        .filter((row) => (row as unknown as { contributor_id?: string }).contributor_id === profile.user_id)
        .map((row) => ({ entry_type: row.entry_type, status: row.status, amount: Number(row.amount) }));
      const redemptions = redemptionStats
        .filter((row) => (row as unknown as { contributor_id?: string }).contributor_id === profile.user_id)
        .map((row) => ({ amount: Number(row.amount), status: row.status }));
      const state = aggregateRewardState(entries, redemptions);

      return {
        userId: profile.user_id,
        email: emails.get(profile.user_id) ?? null,
        displayName: profile.display_name,
        accountStatus: profile.account_status,
        memberSince: profile.created_at,
        submissions: submissionCounts.get(profile.user_id) ?? 0,
        approved: approvedCounts.get(profile.user_id) ?? 0,
        availablePoints: state.availablePoints,
        outstandingPoints: state.outstandingPoints,
      };
    });

    return NextResponse.json(
      { contributors, pagination: { count: contributors.length } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Contributor list failed:', error);
    return NextResponse.json({ error: 'Could not load the contributor list.' }, { status: 500 });
  }
}

/**
 * Owner changes a contributor's standing (active/suspended). Suspended accounts
 * fail requireUser on every API call, so this is a real off switch. Protected:
 * admins cannot be suspended through this route, audit trail is written.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const userId = payload['userId'];
  const accountStatus = payload['accountStatus'];

  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
  }
  if (accountStatus !== 'active' && accountStatus !== 'suspended') {
    return NextResponse.json({ error: 'Account status must be active or suspended.' }, { status: 400 });
  }
  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'You cannot change your own account status here.' }, { status: 400 });
  }

  // Contributor control: allowlisted admins are out of reach for this route.
  const { data: adminRow, error: adminError } = await db()
    .from('admin_users')
    .select('user_id, disabled_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (adminError) {
    console.error('Contributor status admin lookup failed:', adminError.code);
    return NextResponse.json({ error: 'Could not verify contributor status.' }, { status: 500 });
  }
  if (adminRow && !adminRow.disabled_at) {
    return NextResponse.json({ error: 'Another administrator cannot be suspended from the contributor view.' }, { status: 403 });
  }

  const { error: updateError } = await db()
    .from('profiles')
    .update({ account_status: accountStatus })
    .eq('user_id', userId);
  if (updateError) {
    console.error('Contributor status update failed:', updateError.code);
    return NextResponse.json({ error: 'Could not update the contributor status.' }, { status: 500 });
  }

  await db().from('audit_logs').insert({
    actor_id: auth.user.id,
    action: 'contributor_account_status_changed',
    entity_type: 'profiles',
    entity_id: userId,
    reason_code: accountStatus,
    safe_metadata: { account_status: accountStatus },
  });

  return NextResponse.json({ ok: true });
}

/** Resolves emails through the trusted server (auth admin API), page by page. */
async function resolveUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (userIds.length === 0) return emails;

  const wanted = new Set(userIds);
  for (let page = 1; page <= 5 && wanted.size > 0; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('Auth user listing failed:', error.code);
      break;
    }
    for (const user of data.users) {
      if (wanted.has(user.id) && typeof user.email === 'string') {
        emails.set(user.id, user.email);
        wanted.delete(user.id);
      }
    }
    if ((data.users ?? []).length < 200) break;
  }
  return emails;
}
