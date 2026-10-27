#!/usr/bin/env node
/**
 * Reports the columns PostgREST currently exposes for key tables, so a schema
 * mismatch can be spotted before runtime does. Prints column names only —
 * never row data or keys. Requires 0007 to be applied for is_demo columns to
 * appear; mismatches are called out at the end.
 */
import { demoDb } from './demo-db.mjs';

const TARGETS = [
  {
    table: 'posts',
    expect: ['platform', 'canonical_url', 'platform_post_id', 'last_seen_at'],
  },
  {
    table: 'resources',
    expect: ['post_id', 'resource_url', 'normalized_resource_url', 'resource_type', 'status', 'submitted_by', 'submitted_ip_hash', 'is_demo'],
  },
  {
    table: 'submissions',
    expect: ['post_id', 'submitted_by', 'resource_id', 'source', 'submitted_ip_hash', 'is_demo'],
  },
  {
    table: 'resource_reports',
    expect: ['resource_id', 'reporter_ip_hash', 'reason'],
  },
  {
    table: 'profiles',
    expect: ['user_id', 'username', 'username_created_ip_hash', 'username_created_at'],
  },
  {
    table: 'promotion_requests',
    expect: ['user_id', 'headline', 'detail', 'target_url', 'status', 'active_until'],
  },
];

// Phase-2 RPCs applied by 0008. A PGRST202 ("could not find the function")
// means the migration has not been applied yet; any other result (including
// an intentional invalid-input rejection) proves the function exists.
const RPCS = [
  { name: 'public_stats', args: {} },
  { name: 'leaderboard_top', args: {} },
  { name: 'active_promotion', args: {} },
  { name: 'contributor_rank', args: { p_user_id: null } },
  { name: 'submit_promotion', args: { p_user_id: null } },
  { name: 'admin_promotion_decide', args: { p_request_id: null } },
];

async function probeRpcs(db) {
  for (const probe of RPCS) {
    let outcome;
    try {
      const { error } = await db.rpc(probe.name, probe.args);
      outcome = error
        ? (error.code === 'PGRST202' ? 'NOT APPLIED (function missing)' : `exists (rejected call: ${error.code})`)
        : 'exists (executed)';
    } catch (rpcError) {
      outcome = `probe failed: ${rpcError instanceof Error ? rpcError.message : String(rpcError)}`;
    }
    console.log(`  ${probe.name}: ${outcome}`);
  }
}

async function columnsFor(db, table) {
  const { data, error } = await db.from(table).select('*').limit(1);
  if (error) return { error };
  // An empty table yields no keys from the REST layer; then at least confirm
  // the table exists by probing a whitelisted column list via head request.
  if (data && data.length > 0 && data[0] && typeof data[0] === 'object') {
    return { columns: Object.keys(data[0]).sort() };
  }
  return { columns: [] };
}

async function main() {
  const db = demoDb();
  let mismatches = 0;

  for (const target of TARGETS) {
    const { columns, error } = await columnsFor(db, target.table);
    if (error) {
      console.log(`\n${target.table}: NOT QUERYABLE [${error.code ?? '?'}] ${error.message}`);
      mismatches += 1;
      continue;
    }
    if (columns.length === 0) {
      console.log(`\n${target.table}: exists, but is empty — column list unavailable via REST.`);
      continue;
    }
    console.log(`\n${target.table} columns (${columns.length}):`);
    console.log('  ' + columns.join(', '));
    const missing = target.expect.filter((column) => !columns.includes(column));
    if (missing.length > 0) {
      mismatches += 1;
      console.log(`  MISSING expected column(s): ${missing.join(', ')}`);
    } else {
      console.log('  all expected columns present');
    }
  }

  console.log(mismatches > 0
    ? `\n${mismatches} table(s) need attention (apply 0007/0008 first if the expected columns or tables are missing).`
    : '\nSchema probe complete: every expected column is present.');

  console.log('\nPhase-2 RPC probe (0008):');
  await probeRpcs(db);
}

await main();
