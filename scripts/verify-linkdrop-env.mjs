import process from 'node:process';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const optional = [
  'NEXT_PUBLIC_SITE_URL',
];

let failed = false;

console.log('\nLinkDrop environment check');
console.log('===========================');

for (const name of required) {
  const value = process.env[name];
  const present = typeof value === 'string' && value.trim().length > 0;
  console.log(`${present ? 'PASS' : 'FAIL'} required: ${name}`);
  if (!present) failed = true;
}

for (const name of optional) {
  const value = process.env[name];
  const present = typeof value === 'string' && value.trim().length > 0;
  console.log(`${present ? 'SET' : 'INFO'} optional: ${name}${present ? '' : ' (not set)'}`);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FAIL: a service-role key is also exposed through a NEXT_PUBLIC_ variable. Remove it immediately and rotate the key if it was deployed.');
  failed = true;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      console.error('FAIL: Supabase URL must use HTTPS outside local development.');
      failed = true;
    }
  } catch {
    console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
    failed = true;
  }
}

if (failed) {
  console.error('\nEnvironment check failed. Values were intentionally not printed.');
  process.exitCode = 1;
} else {
  console.log('\nRequired environment variables are present. This does not verify credentials, database connectivity, or permissions.');
}
