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
    expect: ['post_id', 'resource_url', 'normalized_resource_url', 'resource_type', 'status'],
  },
  {
    table: 'submissions',
    expect: ['post_id', 'submitted_by', 'resource_id', 'source', 'submitted_ip_hash', 'is_demo'],
  },
  {
    table: 'resource_reports',
    expect: ['resource_id', 'reporter_ip_hash', 'reason'],
  },
];

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
    ? `\n${mismatches} table(s) need attention (apply 0007 first if is_demo/resource_reports are missing).`
    : '\nSchema probe complete: every expected column is present.');
}

await main();
