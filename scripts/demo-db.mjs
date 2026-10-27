/**
 * Shared bootstrap for the demo seed/remove scripts.
 *
 *Loads .env.local from the project root (plain node has no env loader) and
 * returns a Supabase client carrying the service-role key. The key is used
 * server-side only and never printed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export function projectRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

function loadEnvLocal(root) {
  const envPath = path.join(root, '.env.local');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`FAIL: ${envPath} was not found. Create it from .env.example first.`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (process.env[name] !== undefined) continue; // real env wins
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

export function demoDb() {
  const root = projectRoot();
  loadEnvLocal(root);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be present in .env.local.');
    process.exit(1);
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('FAIL: a service-role key is exposed through a NEXT_PUBLIC_ variable. Fix .env.local before continuing.');
    process.exit(1);
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Fails fast unless migration 0007 (anonymous pivot) has been applied. */
export async function requirePivotMigration(db) {
  const { error } = await db.from('posts').select('id, is_demo').limit(1);
  if (!error) return;

  const message = String(error.message ?? '');
  if (/is_demo|does not exist|column/i.test(message)) {
    console.error('FAIL: migration 0007_anonymous_pivot.sql is not applied yet.');
    console.error('Open the Supabase SQL editor and run supabase/migrations/0007_anonymous_pivot.sql, then retry.');
  } else {
    console.error(`FAIL: could not talk to Supabase (${error.code ?? 'unknown'}): ${message}`);
  }
  process.exit(1);
}
