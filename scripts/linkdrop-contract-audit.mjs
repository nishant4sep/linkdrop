import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => {
  const full = path.join(root, relative);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
};

const findings = [];
const report = (level, message) => findings.push({ level, message });
const requireFile = (file) => {
  const content = read(file);
  if (content === null) report('FAIL', `Missing expected file: ${file}`);
  return content ?? '';
};

const schema = requireFile('supabase/schema.sql');
const migrationDir = path.join(root, 'supabase/migrations');
let migrationFiles = [];
if (!fs.existsSync(migrationDir)) {
  report('WARN', 'supabase/migrations directory does not exist.');
} else {
  migrationFiles = fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, content: fs.readFileSync(path.join(migrationDir, name), 'utf8') }));
  if (migrationFiles.length === 0) report('WARN', 'No migration files found.');
}

const migrations = migrationFiles.map((file) => file.content).join('\n');
const allSql = `${schema}\n${migrations}`;
const server = requireFile('src/lib/server.ts');
const submitRoute = requireFile('src/app/api/submit/route.ts');
const resolveRoute = requireFile('src/app/api/resolve/route.ts');
const adminRoute = requireFile('src/app/api/admin/submissions/route.ts');
const payoutRoute = requireFile('src/app/api/admin/payouts/route.ts');
const contributorRoute = requireFile('src/app/api/admin/contributors/route.ts');
const mePayoutRoute = requireFile('src/app/api/me/payouts/route.ts');
const adminFoundation = requireFile('supabase/migrations/0004_admin_access_foundation.sql');
const rewardsFoundation = requireFile('supabase/migrations/0006_rewards_and_payouts.sql');
const pivotFoundation = requireFile('supabase/migrations/0007_anonymous_pivot.sql');
const accountsFoundation = requireFile('supabase/migrations/0008_accounts_leaderboard.sql');
const publicSubmitRoute = requireFile('src/app/api/public/submit/route.ts');
const reportRoute = requireFile('src/app/api/report/route.ts');
const adminReportsRoute = requireFile('src/app/api/admin/reports/route.ts');
const landingPage = requireFile('src/app/r/[code]/page.tsx');
const publicCard = requireFile('src/components/public-link-card.tsx');
const submitPublic = requireFile('src/components/submit-public.tsx');
const sitemapRoute = requireFile('src/app/sitemap.ts');
const robotsRoute = requireFile('src/app/robots.ts');
const seedDemo = requireFile('scripts/seed-demo.mjs');
const removeDemo = requireFile('scripts/remove-demo.mjs');
// Phase 2: accounts, leaderboard, promotions.
const authRoute = requireFile('src/app/api/auth/username/route.ts');
const leaderboardPage = requireFile('src/app/leaderboard/page.tsx');
const mePromotionsRoute = requireFile('src/app/api/me/promotions/route.ts');
const adminPromotionsRoute = requireFile('src/app/api/admin/promotions/route.ts');
const adminPage = requireFile('src/app/admin/page.tsx');
const promotionQueue = requireFile('src/components/console/promotion-queue.tsx');
const sponsorGate = requireFile('src/components/sponsor-gate.tsx');
const homeLookup = requireFile('src/components/home-lookup.tsx');
const publicSponsorRoute = requireFile('src/app/api/public/sponsor/route.ts');
const livePresence = requireFile('src/components/live-presence.tsx');
const adminOverviewRoute = requireFile('src/app/api/admin/overview/route.ts');
const overviewTab = requireFile('src/components/console/overview-tab.tsx');
const homePage = requireFile('src/app/page.tsx');
const liveLib = requireFile('src/lib/live.ts');
const sponsorComponent = requireFile('src/components/sponsor.tsx');
const loginPage = requireFile('src/app/login/page.tsx');
const dashboardPage = requireFile('src/app/dashboard/page.tsx');
const siteLib = requireFile('src/lib/site.ts');

const sqlHasTable = (name) => new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?${name}\\b`, 'i').test(allSql);
const sqlHasFunction = (name) => new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\b`, 'i').test(allSql);
const hasColumnSomewhere = (table, column) => {
  const chunks = [schema, ...migrationFiles.map((item) => item.content)];
  return chunks.some((sql) => {
    const re = new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, 'i');
    const match = sql.match(re);
    if (match && new RegExp(`(?:^|[,\\n])\\s*${column}\\s+`, 'im').test(match[1])) return true;
    // Columns added later via ALTER TABLE ... ADD COLUMN (also comma-chained forms).
    const alterRe = new RegExp(
      `alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?${table}\\b[\\s\\S]{0,400}?add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+${column}\\b`,
      'i',
    );
    return alterRe.test(sql);
  });
};

for (const table of ['profiles', 'posts', 'resources', 'submissions']) {
  if (!sqlHasTable(table)) report('FAIL', `No CREATE TABLE found for ${table} in schema/migrations.`);
}

for (const [table, columns] of Object.entries({
  posts: ['canonical_url'],
  submissions: ['post_id', 'submitted_by', 'status'],
  resources: ['post_id', 'resource_url', 'status'],
})) {
  for (const column of columns) {
    if (!hasColumnSomewhere(table, column)) report('WARN', `Could not confirm ${table}.${column} in a CREATE TABLE block. Check schema and migrations manually.`);
  }
}

if (!sqlHasTable('admin_users')) report('FAIL', 'No CREATE TABLE found for admin_users. Admin authorization may not work.');
if (!sqlHasFunction('review_linkdrop_submission')) report('WARN', 'Could not find review_linkdrop_submission RPC definition. Verify admin moderation route and database RPC agree.');
if (!sqlHasFunction('consume_rate_limit')) report('WARN', 'Could not find consume_rate_limit RPC definition. Verify rate limiting is backed by the database.');

// Reward and payout invariants (0006).
if (!rewardsFoundation.trim()) {
  report('WARN', '0006_rewards_and_payouts.sql is missing; payout RPCs are not backed by SQL.');
} else {
  for (const fn of ['request_linkdrop_redemption', 'review_linkdrop_redemption', 'linkdrop_available_points']) {
    if (!sqlHasFunction(fn)) report('FAIL', `Reward RPC ${fn} not found in schema/migrations.`);
  }
  if (!/idempotency_key/.test(rewardsFoundation)) {
    report('FAIL', 'Reward migration does not mention idempotency keys; replay safety is unproven.');
  }
  if (!/pg_advisory_xact_lock/.test(rewardsFoundation)) {
    report('FAIL', 'Redemption request does not serialize with an advisory lock; concurrent requests could overspend.');
  }
  if (!/revoke all on function/.test(rewardsFoundation)) {
    report('FAIL', 'Reward RPCs are not explicitly revoked from public roles.');
  }
}
if (!sqlHasTable('reward_ledger')) report('FAIL', 'No CREATE TABLE found for reward_ledger.');
if (!sqlHasTable('reward_redemptions')) report('FAIL', 'No CREATE TABLE found for reward_redemptions.');

// Anonymous pivot invariants (0007). Cash payouts stay dormant; instant
// publish + one-report auto-hide must be backed by real SQL.
if (!pivotFoundation.trim()) {
  report('FAIL', '0007_anonymous_pivot.sql is missing; the anonymous instant-publish path is not backed by SQL.');
} else {
  if (!sqlHasFunction('submit_public_link')) report('FAIL', 'submit_public_link RPC not found in schema/migrations.');
  if (!sqlHasFunction('report_resource')) report('FAIL', 'report_resource RPC not found in schema/migrations.');
  if (!sqlHasFunction('admin_resolve_report')) report('FAIL', 'admin_resolve_report RPC not found in schema/migrations.');
  if (!sqlHasTable('resource_reports')) report('FAIL', 'No CREATE TABLE found for resource_reports.');
  if (!/submitted_ip_hash/.test(pivotFoundation)) report('FAIL', '0007 does not add IP-hash provenance columns; anonymous fingerprinting has no backing.');
  if (!/is_demo/.test(pivotFoundation)) report('FAIL', '0007 does not add is_demo flags; demo data cannot be stripped safely.');
  if (!/pg_advisory_xact_lock/.test(pivotFoundation)) report('FAIL', 'submit_public_link does not serialize concurrent first submissions with an advisory lock.');
  if (!/no_admin_configured/.test(pivotFoundation)) report('FAIL', 'submit_public_link has no admin-presence guard; publishing could open before any reviewer exists.');
  if (!/revoke all on function/.test(pivotFoundation)) report('FAIL', 'Pivot RPCs are not explicitly revoked from public roles.');
  if (!/resource_id, reporter_ip_hash/.test(pivotFoundation.replace(/\s+/g, ' '))) {
    report('WARN', 'Could not confirm the unique (resource_id, reporter_ip_hash) visitor-once index on resource_reports.');
  }
}
if (publicSubmitRoute.trim()) {
  if (!/submit_public_link/.test(publicSubmitRoute)) report('FAIL', 'Public submit route does not call the submit_public_link RPC.');
  if (/allow.*status|status===.{0,12}active/i.test(publicSubmitRoute)) {
    report('WARN', 'Public submit route seems to filter resource status client-side; trust only DB-side statuses.');
  }
  if (!/consumeRateLimit/.test(publicSubmitRoute)) report('FAIL', 'Public submit route has no rate limiting; spam can flood the directory.');
  if (!/clientIpHash/.test(publicSubmitRoute)) report('FAIL', 'Public submit route does not hash submitter IPs before storage.');
  if (!/honeypotTripped/.test(publicSubmitRoute)) report('FAIL', 'Public submit route does not check the honeypot field.');
  if (/requireUser/.test(publicSubmitRoute)) report('WARN', 'Public submit route references requireUser; the anonymous flow must not demand an account.');
}
if (reportRoute.trim()) {
  if (!/report_resource/.test(reportRoute)) report('FAIL', 'Report route does not call the report_resource RPC.');
  if (!/consumeRateLimit/.test(reportRoute)) report('FAIL', 'Report route has no rate limiting; griefers can spam the queue.');
  if (!/clientIpHash/.test(reportRoute)) report('FAIL', 'Report route does not hash reporter IPs before storage.');
}
if (adminReportsRoute.trim()) {
  if (!/requireAdmin/.test(adminReportsRoute)) report('FAIL', 'Admin reports route does not visibly call requireAdmin.');
  if (!/admin_resolve_report/.test(adminReportsRoute)) report('FAIL', 'Admin reports route does not call the admin_resolve_report RPC.');
}
if (landingPage.trim()) {
  if (!/generateMetadata/.test(landingPage)) report('FAIL', 'Per-post landing page has no generateMetadata; the SEO bet is idle.');
  if (!/application\/ld\+json/.test(landingPage)) report('WARN', 'Per-post landing page has no JSON-LD ItemList.');
  if (!/status.{0,20}active|eq\('status', 'active'\)/.test(landingPage)) {
    report('FAIL', 'Landing page does not visibly filter resources to active; hidden rows could leak.');
  }
}
if (submitPublic.trim() && !/company/.test(submitPublic)) {
  report('FAIL', 'SubmitPublic component is missing the company honeypot field the API expects.');
}
if (publicCard.trim() && !/\/api\/report/.test(publicCard)) {
  report('FAIL', 'PublicLinkCard has no report flow wired to /api/report.');
}
if (!sitemapRoute.trim()) report('FAIL', 'src/app/sitemap.ts is missing; posts are not discoverable by search engines.');
if (!robotsRoute.trim()) report('FAIL', 'src/app/robots.ts is missing; crawler directives are unmanaged.');
if (!seedDemo.trim()) report('FAIL', 'scripts/seed-demo.mjs is missing; phase-1 demo content cannot be seeded.');
if (!removeDemo.trim()) report('FAIL', 'scripts/remove-demo.mjs is missing; demo data cannot be stripped before launch.');
if (seedDemo.trim() && !/is_demo:\s*true|is_demo: true/.test(seedDemo)) {
  report('FAIL', 'seed-demo.mjs does not flag rows with is_demo; stripping would be unsafe.');
}
if (mePayoutRoute && !/requireUser/.test(mePayoutRoute)) {
  report('FAIL', 'Contributor payout route does not visibly call requireUser.');
}

// ---------------------------------------------------------------------------
// Phase 2 invariants (0008): username accounts, count-based leaderboard, and
// the owner-reviewed promotion flow. NO points earning anywhere.
// ---------------------------------------------------------------------------
if (!accountsFoundation.trim()) {
  report('FAIL', '0008_accounts_leaderboard.sql is missing; accounts/leaderboard/promotions are not backed by SQL.');
} else {
  for (const fn of ['leaderboard_top', 'public_stats', 'contributor_rank', 'submit_promotion', 'admin_promotion_decide', 'active_promotion']) {
    if (!sqlHasFunction(fn)) report('FAIL', `Phase-2 RPC ${fn} not found in schema/migrations.`);
  }
  if (!sqlHasTable('promotion_requests')) report('FAIL', 'No CREATE TABLE found for promotion_requests.');
  if (!/profiles_username_unique_idx/.test(accountsFoundation)) report('FAIL', '0008 does not create the unique username index; duplicate usernames could be created under race.');
  if (!/submit_public_link[\s\S]*p_submitter_id/.test(accountsFoundation.replace(/\s+/g, ' '))) {
    report('FAIL', '0008 does not extend submit_public_link with optional account attribution (p_submitter_id).');
  }
  if (!/promotion_requests[\s\S]{0,80}enable\s+row\s+level\s+security/.test(accountsFoundation)) {
    report('FAIL', 'promotion_requests has no RLS enabled; client policies could bypass the owner queue.');
  }
  if (!/revoke all on function/.test(accountsFoundation)) {
    report('FAIL', 'Phase-2 RPCs are not explicitly revoked from public roles.');
  }
  if (!/contributor_rank/.test(accountsFoundation.split('create or replace function public.submit_promotion')[1] ?? '')) {
    report('FAIL', 'submit_promotion does not enforce eligibility through contributor_rank SQL-side.');
  }
  const activePromoSection = accountsFoundation.split('create or replace function public.active_promotion')[1] ?? '';
  if (!/contributor_rank/.test(activePromoSection)) {
    report('FAIL', 'active_promotion does not re-verify top-of-leaderboard status; expired winners could render forever.');
  }
}
if (siteLib.trim() && (!/PROMO_TOP_N|PROMO_MIN_LINKS/.test(siteLib) || !/NO points/i.test(siteLib))) {
  report('WARN', 'src/lib/site.ts should document the phase-2 policy (top N, minimum links, no points earning).');
}
if (authRoute.trim()) {
  if (!/honeypotTripped/.test(authRoute)) report('FAIL', 'Auth route has no honeypot check; bots can mass-register usernames.');
  if (!/consumeRateLimit/.test(authRoute)) report('FAIL', 'Auth route has no rate limiting; username namespace can be squatted at scale.');
  if (!/clientIpHash/.test(authRoute)) report('FAIL', 'Auth route does not hash IPs for username_created_ip_hash.');
  if (!/turnstileOk/.test(authRoute)) report('FAIL', 'Auth route does not run the (optional) Turnstile check.');
  if (!/ACCOUNT_AUTH_EMAIL_SUFFIX/.test(authRoute)) report('FAIL', 'Auth route does not synthesize the internal auth email alias.');
  if (!/deleteUser/.test(authRoute)) report('FAIL', 'Auth route does not compensate failed profile inserts by deleting the orphan auth user.');
  if (!/RESERVED_USERNAMES/.test(authRoute)) report('FAIL', 'Auth route does not block reserved usernames.');
}
if (loginPage.trim()) {
  if (!/\/api\/auth\/username/.test(loginPage)) report('FAIL', 'Login page no longer talks to the username API; accounts would break.');
  if (/auth\.signUp/.test(loginPage)) report('FAIL', 'Login page still calls the legacy email signUp client-side; phase-2 signup must go through the server route.');
}
if (dashboardPage.trim() && /reward-math|availablePoints|requestPayout/.test(dashboardPage)) {
  report('FAIL', 'Dashboard still shows the old points/payout UI; the confirmed phase-2 model has NO points earning.');
}
if (leaderboardPage.trim()) {
  if (!/fetchLeaderboard/.test(leaderboardPage)) report('FAIL', 'Leaderboard page does not read the SQL-backed leaderboard RPC.');
  if (!/generateMetadata|export const metadata/.test(leaderboardPage)) report('WARN', 'Leaderboard page has no metadata; it is a public SEO surface.');
  if (/isDemo|is_demo/.test(leaderboardPage)) report('WARN', 'Leaderboard page references demo rows directly; trust only the RPC.');
}
if (mePromotionsRoute.trim()) {
  if (!/requireUser/.test(mePromotionsRoute)) report('FAIL', 'Me promotions route does not visibly call requireUser.');
  if (!/consumeRateLimit/.test(mePromotionsRoute)) report('FAIL', 'Me promotions route has no rate limiting.');
  if (!/submit_promotion/.test(mePromotionsRoute)) report('FAIL', 'Me promotions route bypasses the DB-enforced eligibility RPC.');
}
if (adminPromotionsRoute.trim()) {
  if (!/requireAdmin/.test(adminPromotionsRoute)) report('FAIL', 'Admin promotions route does not visibly call requireAdmin.');
  if (!/admin_promotion_decide/.test(adminPromotionsRoute)) report('FAIL', 'Admin promotions route does not call the deciding RPC.');
}
if (promotionQueue.trim() && !/\/api\/admin\/promotions/.test(promotionQueue)) {
  report('FAIL', 'Promotion console component is not wired to the admin promotions API.');
}
if (homePage.trim()) {
  if (!/fetchPublicStats/.test(homePage)) report('FAIL', 'Home page does not render real live counters (public_stats).');
  if (!/SponsorSlot|sponsor/i.test(homePage)) report('FAIL', 'Home page has no sponsor slot / leaderboard-promo CTA.');
  if (/\bpoints\b|\bpts\b/i.test(homePage.replace(/pointless|viewpoints/g, ''))) {
    report('WARN', 'Home page mentions points/pts; the phase-2 model has no points economy.');
  }
}
if (liveLib.trim()) {
  if ((sponsorComponent === '' || !/nofollow sponsored/.test(sponsorComponent))) report('WARN', 'Sponsor links are not marked nofollow/sponsored; paid attribution guidance for search engines.');
  if (!/active_promotion/.test(liveLib)) report('FAIL', 'Sponsor slot does not read the eligibility-checked active_promotion RPC.');
}
if (publicSubmitRoute.trim() && !/p_submitter_id|optionalSubmitterId/.test(publicSubmitRoute)) {
  report('WARN', 'Public submit route does not attach optional account attribution; signed-in submissions would never count.');
}
if (sitemapRoute.trim() && !/leaderboard/.test(sitemapRoute)) {
  report('WARN', 'Sitemap does not include /leaderboard; an indexable phase-2 surface is missing from discovery.');
}
// ---------------------------------------------------------------------------
// Monetization surfaces: the sponsored search gate, extra placements, and the
// owner overview console. Guardrails keep the "earned, not bought" promise.
// ---------------------------------------------------------------------------
if (!sponsorGate.trim()) {
  report('FAIL', 'Sponsor gate component missing: search interstitial cannot render owned promos.');
} else {
  if (!sponsorGate.includes('rel="noreferrer nofollow sponsored"')) {
    report('FAIL', 'Sponsor gate does not mark the sponsored link rel="nofollow sponsored".');
  }
  if (!/SKIP_SECONDS/.test(sponsorGate)) report('FAIL', 'Sponsor gate has no configurable skip timer.');
  if (!/gateCooldownActive|COOLDOWN_MS/.test(sponsorGate)) report('WARN', 'Sponsor gate has no per-visitor cooldown knob; every search will show the wait.');
}
if (homeLookup.trim() && !/SponsorGate/.test(homeLookup)) {
  report('FAIL', '"Find resource" does not route through the sponsor gate; the owner ad surface is dead code.');
}
if (!publicSponsorRoute.trim()) {
  report('FAIL', 'Public sponsor endpoint missing: the search gate cannot fetch the live promo.');
}
if (!livePresence.trim()) {
  report('FAIL', 'Live presence component missing: the home page has no live visitor pulse.');
} else if (!/presenceState/.test(livePresence)) {
  // The count must come from Realtime presenceState — never invented.
  report('FAIL', 'Live presence does not count real Realtime presence; fabricating a viewer count is banned.');
}
if (!adminOverviewRoute.trim()) {
  report('FAIL', 'Admin overview endpoint missing: the owner console cannot show directory metrics.');
} else if (!/requireAdmin/.test(adminOverviewRoute)) {
  report('FAIL', 'Admin overview route does not visibly call requireAdmin.');
}
if (adminPage.trim() && !/overview/.test(adminPage)) {
  report('FAIL', 'Owner console lacks the Overview monitoring tab.');
}
if (overviewTab.trim() && !adminOverviewRoute) {
  report('FAIL', 'Overview console exists without its metrics endpoint.');
}
if (payoutRoute && !/requireAdmin/.test(payoutRoute)) {
  report('FAIL', 'Admin payouts route does not visibly call requireAdmin.');
}
if (contributorRoute && !/requireAdmin/.test(contributorRoute)) {
  report('FAIL', 'Admin contributors route does not visibly call requireAdmin.');
}

for (const [file, content] of [
  ['src/app/api/submit/route.ts', submitRoute],
  ['src/app/api/resolve/route.ts', resolveRoute],
  ['src/app/api/admin/submissions/route.ts', adminRoute],
]) {
  if (!content.trim()) continue;
  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(content) && !/process\.env/.test(content)) {
    report('WARN', `${file}: service-role reference detected without an obvious process.env reference. Inspect key handling manually.`);
  }
}

if (!/requireAdmin/.test(adminRoute)) report('FAIL', 'Admin submissions route does not visibly call requireAdmin.');
if (!/requireUser/.test(submitRoute)) report('WARN', 'Submission route does not visibly call requireUser. Verify server-side authentication.');
if (!/eq\('status', 'active'\)/.test(resolveRoute)) report('WARN', 'Resolver has no visible active-status filter. Verify it never exposes pending, disputed, or removed resources.');
if (!/admin_users/.test(server) && !/requireAdmin/.test(server)) report('WARN', 'Server helper does not visibly mention admin_users. Manually verify admin authorization implementation.');
if (!/admin_users/.test(adminFoundation)) report('FAIL', 'Admin foundation migration does not visibly define admin_users.');

const envExample = read('.env.example');
if (envExample === null) {
  report('WARN', 'No .env.example found.');
} else {
  if (!envExample.includes('NEXT_PUBLIC_SUPABASE_URL')) report('WARN', '.env.example does not document NEXT_PUBLIC_SUPABASE_URL.');
  if (!envExample.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')) report('WARN', '.env.example does not document NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  if (!envExample.includes('SUPABASE_SERVICE_ROLE_KEY')) report('WARN', '.env.example does not document SUPABASE_SERVICE_ROLE_KEY. Check server configuration and setup docs.');
  if (!envExample.includes('REDEMPTIONS_ENABLED')) report('WARN', '.env.example does not document REDEMPTIONS_ENABLED; the dormant-payouts kill switch is undocumented.');
  if (!envExample.includes('TURNSTILE_SECRET')) report('WARN', '.env.example does not document TURNSTILE_SECRET; the optional bot check is undocumented.');
  if (!envExample.includes('NEXT_PUBLIC_TURNSTILE_SITE_KEY')) report('WARN', '.env.example does not document NEXT_PUBLIC_TURNSTILE_SITE_KEY; the captcha widget key is undocumented.');
  if (!envExample.includes('IP_HASH_SALT')) report('WARN', '.env.example does not document IP_HASH_SALT; the dedicated IP-hash salt is undocumented.');
}

console.log('\nLinkDrop contract audit (static heuristic only)');
console.log('===============================================');
console.log(`SQL files scanned: ${1 + migrationFiles.length}`);
console.log(`Migration files: ${migrationFiles.length}`);
for (const item of findings) console.log(`${item.level.padEnd(4)} ${item.message}`);
if (findings.length === 0) console.log('INFO No heuristic issues detected. This is not proof of correctness or security.');

const failures = findings.filter((item) => item.level === 'FAIL').length;
const warnings = findings.filter((item) => item.level === 'WARN').length;
console.log(`\nSummary: ${failures} failure(s), ${warnings} warning(s).`);
console.log('This script does not connect to Supabase, execute migrations, compile TypeScript, or test runtime behavior. Review every result manually.');
if (failures > 0) process.exitCode = 1;
