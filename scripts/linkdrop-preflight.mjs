import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const warnings = [];
const passed = [];

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function pass(message) { passed.push(message); }
function warn(message) { warnings.push(message); }
function fail(message) { failures.push(message); }

function checkFile(file, required = true) {
  if (exists(file)) pass(`Found ${file}`);
  else if (required) fail(`Missing required file: ${file}`);
  else warn(`Optional file not found: ${file}`);
}

function scanFiles(directory, extensions, output = []) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'coverage', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(absolute, entry.name);
    if (entry.isDirectory()) scanFiles(path.relative(root, full), extensions, output);
    else if (extensions.includes(path.extname(entry.name))) output.push(full);
  }
  return output;
}

function packageJson() {
  if (!exists('package.json')) {
    fail('package.json is missing; run this from the project root.');
    return null;
  }
  try { return JSON.parse(read('package.json')); }
  catch { fail('package.json is not valid JSON.'); return null; }
}

console.log('\nLinkDrop preflight — static checks only\n');

const pkg = packageJson();
if (pkg) {
  pass(`Read package.json (${pkg.name ?? 'unnamed project'})`);
  for (const script of ['build', 'lint']) {
    if (pkg.scripts?.[script]) pass(`npm script exists: ${script}`);
    else warn(`No npm script named ${script}; add it if appropriate for this project.`);
  }
  if (pkg.scripts?.['typecheck']) pass('npm script exists: typecheck');
  else if (pkg.scripts?.['type-check']) pass('npm script exists: type-check');
  else warn('No type-check script found. A TypeScript project should have one.');
}

const expected = [
  ['supabase/schema.sql', true],
  ['supabase/migrations/0003_atomic_moderation_and_rate_limits.sql', true],
  ['supabase/migrations/0004_admin_access_foundation.sql', true],
  ['src/lib/server.ts', true],
  ['src/app/api/resolve/route.ts', true],
  ['src/app/api/submit/route.ts', true],
  ['src/app/api/admin/submissions/route.ts', true],
  ['src/app/api/me/submissions/route.ts', true],
  ['src/app/login/page.tsx', true],
  ['src/app/dashboard/page.tsx', true],
  ['src/app/admin/page.tsx', true],
  ['docs/SECURITY_MODEL.md', false],
  ['docs/IMPLEMENTATION_STATUS.md', false],
];
for (const [file, required] of expected) checkFile(file, required);

const envExample = ['.env.example', '.env.local.example', 'docs/ENVIRONMENT.md'].some(exists);
if (envExample) pass('Found an environment-variable template or guide');
else warn('No environment template found. Document variable NAMES only; never commit secret values.');

const secretPatterns = [
  { name: 'Supabase service-role key in source', re: /(?:SUPABASE_SERVICE_ROLE_KEY|service_role)[^\n]{0,100}(?:eyJ[a-zA-Z0-9_-]{20,}|[a-f0-9]{50,})/i },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Likely hard-coded secret assignment', re: /(?:api[_-]?key|secret|access[_-]?token|password)\s*[:=]\s*['"][^'"\s]{20,}['"]/i },
];

const scanRoots = ['src', 'scripts', 'supabase', 'tests'];
const sourceFiles = [...new Set(scanRoots.flatMap((dir) => scanFiles(dir, ['.ts', '.tsx', '.js', '.mjs', '.sql'])) )];
let secretHits = 0;
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  for (const pattern of secretPatterns) {
    if (pattern.re.test(content)) {
      fail(`Potential ${pattern.name} in ${relative}; inspect manually and rotate exposed credentials if real.`);
      secretHits++;
    }
  }
}
if (!secretHits) warn('No obvious hard-coded secrets detected by basic pattern scan. This is not proof that secrets are absent.');

if (exists('src/lib/server.ts')) {
  const server = read('src/lib/server.ts');
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(server)) pass('Server helper references the service-role environment variable');
  else warn('Server helper does not visibly reference SUPABASE_SERVICE_ROLE_KEY; verify how privileged database access is configured.');
  if (/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/.test(server)) fail('Server helper references a NEXT_PUBLIC service-role variable. Privileged keys must never use NEXT_PUBLIC_.');
}

if (exists('supabase/schema.sql') && exists('supabase/migrations/0003_atomic_moderation_and_rate_limits.sql')) {
  const schema = read('supabase/schema.sql');
  const migration = read('supabase/migrations/0003_atomic_moderation_and_rate_limits.sql');
  const assumptions = [
    ['submissions table', /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?submissions/i],
    ['resources table', /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?resources/i],
    ['posts table', /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?posts/i],
  ];
  for (const [label, pattern] of assumptions) {
    if (pattern.test(schema)) pass(`Schema contains declaration for ${label}`);
    else warn(`Could not confirm ${label} in schema.sql; verify the schema file and migration assumptions.`);
  }
  if (/review_linkdrop_submission/i.test(migration)) pass('Moderation RPC declaration found');
  else fail('Expected review_linkdrop_submission RPC was not found in migration 0003.');
  if (/admin_users/i.test(migration)) warn('Migration 0003 references admin_users; verify migration 0004 creates the expected table before applying 0003 or invoking the RPC.');
  if (/create\s+type\s+/i.test(schema)) warn('schema.sql creates enum types and may not be rerunnable. Apply only to a fresh database unless reviewed.');
}

if (exists('src/app/api/resolve/route.ts')) {
  const resolver = read('src/app/api/resolve/route.ts');
  if (/published/i.test(resolver)) pass('Resolver mentions published-resource filtering; verify the actual query restricts results correctly.');
  else warn('Resolver does not visibly mention published resources. Review its public-data boundary.');
  if (/fetch\s*\(/i.test(resolver)) warn('Resolver contains fetch(); review destinations and SSRF protections before allowing user-controlled URLs.');
}

if (exists('supabase/schema.sql')) {
  const schema = read('supabase/schema.sql');
  if (/reward_ledger/i.test(schema)) {
    if (/create\s+trigger/i.test(schema) && /reward_ledger/i.test(schema)) pass('Reward-ledger trigger declarations detected; confirm updates and deletes are prevented as intended.');
    warn('Reward-ledger design requires a human review: append-only entries and pending/posted/voided transitions must not conflict.');
  }
}

console.log('\nPASS');
for (const message of passed) console.log(`  ✓ ${message}`);
console.log('\nWARNINGS');
for (const message of warnings) console.log(`  ! ${message}`);
console.log('\nFAILURES');
for (const message of failures) console.log(`  ✗ ${message}`);
console.log(`\nSummary: ${passed.length} passed, ${warnings.length} warning(s), ${failures.length} failure(s).`);
console.log('This script performs static checks only. It does not connect to Supabase, apply migrations, run a build, or prove application security.');

if (failures.length) process.exitCode = 1;
