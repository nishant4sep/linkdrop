# LinkDrop implementation status

## P1 — server access foundation

Implemented in this checkpoint:

- Server-only Supabase service client.
- Supabase Auth token verification for protected routes.
- Database-backed administrator allowlist, with a disable switch.
- Canonicalization for supported Instagram post, Reel, and IGTV-style URLs.
- Public resolver restricted to published resources and a minimal field selection.
- Destination URL validation helper. It validates URL shape only; it does not prove that a destination is safe, available, or authorized for redistribution.
- Optional same-origin checking helper for browser mutations.

## Important integration checks

The P0 schema and P1 routes must agree on exact enum values and column names. Before deployment, confirm that:

- `profiles.id` references the authenticated Supabase user and `profiles.account_status` uses `active` for enabled accounts.
- `posts.canonical_url` is unique and stores the same canonical URL emitted by `normalizeInstagramPost`.
- `resources.post_id` references `posts.id`.
- `resources.status` includes `active` as the public state.
- `resources.resource_url`, `resource_type`, `description`, and `created_at` exist.

If any item differs in the actual P0 schema, write a migration that reconciles it; do not silently change resolver filters to make test data appear.

## Implemented since this checkpoint

- Authenticated submission workflow (P1/P2), moderation RPC (0003), admin allowlist (0004/0005).
- Reward ledger service and redemption controls (0006): owner console payouts, atomic per-contributor reservation, idempotent reward posting, append-only accounting. See `0006_rewards_and_payouts.sql` and `README.md`. Migration 0006 is self-sufficient: on a database built from migrations only (no `schema.sql`), it creates the reward/redemption/audit tables, the shared trigger functions, and `profiles.display_name` itself.
- Owner console with moderation/payout/contributor consoles and `dashboard.*` subdomain rewrite.

## Phase 1 — anonymous pivot (2026-10-27)

Direction change owned by the project owner: anonymous contributions publish instantly, quality is enforced by one-report auto-hide reviewed by a human (the owner), and the cash payout system is switched off by default. Loyalty-points and promoted slots are phase 2. Claims in marketing ("claim big") must describe only features that exist — no invented numbers.

Implemented in phase 1:

- `supabase/migrations/0007_anonymous_pivot.sql`: nullable `submitted_by`; `submitted_ip_hash`, `source`, `is_demo` provenance columns; `resource_reports` table with a unique (resource, reporter) index; RPCs `submit_public_link` (validated input, advisory-lock serialization, instant `active` publish, `no_admin_configured` guard), `report_resource` (first distinct report quarantines to `disputed`), `admin_resolve_report` (reinstate/remove + audit trail). All service-role only, revoked from public roles.
- `src/lib/ip.ts`: IP extracted from the last `X-Forwarded-For` entry (the client-controllable leftmost value is ignored), stored only as salted sha256; honeypot detection helper.
- `src/app/api/public/submit/route.ts`: anonymous instant-publish endpoint (honeypot, 5/h per IP + 120/h global, optional Turnstile that fails closed when configured, calls the RPC).
- `src/app/api/report/route.ts`: anonymous report endpoint (rate limited, unique per visitor, quarantines on first report).
- `src/app/api/admin/reports/route.ts`: owner queue GET (disputed resources + their unread reports + submitter fingerprint) and PATCH (`admin_resolve_report` via requireAdmin).
- `src/app/api/resolve/route.ts`: now also returns `postCode` and filters `status = 'active'` only.
- `src/app/r/[code]/page.tsx`: per-post SEO landing page — `generateMetadata`, canonical + OpenGraph, JSON-LD `ItemList`, only `active` resources, anonymous submit form below results.
- `src/app/sitemap.ts` + `src/app/robots.ts`: long-tail indexing of posts with active resources; `/api/`, `/admin` disallowed.
- `src/components/public-link-card.tsx` + `submit-public.tsx` + `public-shared.ts`: report UI (reason list + optional details), anonymous publish form with `company` honeypot.
- `src/components/console/reported-queue.tsx` + `src/app/admin/page.tsx`: console **Reports** tab (Reinstate / Remove with audit note).
- `src/lib/rewards.ts` + `src/app/api/me/payouts/route.ts`: payouts disabled by default (`REDEMPTIONS_ENABLED=0`); machinery intact for phase 2 loyalty.
- `scripts/seed-demo.mjs` / `scripts/remove-demo.mjs` (`npm run demo:seed` / `demo:remove`): flagged demo fixtures (`is_demo = true`, `example.com` URLs, `demo-fingerprint-*` hashes) including one pre-quarantined resource for the Reports tab; removal is FK-safe and idempotent.
- `scripts/demo-names.json`: phase-2 demo usernames (leaderboard material; not consumed by any route yet).

Explicitly NOT implemented yet (do not claim otherwise in SEO or meta):

- Turnstile is optional and OFF until `TURNSTILE_SECRET` is set — anonymous submissions currently rely on honeypot + rate limits only.
- The ad gate before revealing links was deliberately NOT built in phase 1; the shape (skippable reveal vs. inline sponsored slot) is an owner decision still pending.
- Usernames/accounts for contributors, captcha'd signup, loyalty points, leaderboard, live counters, promoted slots: phase 2/3. There are no live counters anywhere in the UI that could mislead.
- Link-content verification (none of the destinations are fetched server-side — SSRF by design stays out).

Dormant-by-design (kept, not deleted, for the phase-2 loyalty model):

- Account surfaces: `/login`, `/dashboard` (contributor workspace), `/api/submit`, `/api/me/*`. No public links point at them and `/login`, `/dashboard` are robots-disallowed.
- Console tabs `moderation`, `contributors`, `payouts` render with a "dormant" label; Reports is the only active queue under anonymous publishing.
- Historical phase docs (P1–P5, RELEASE_PLAN) moved to `docs/archive/`.

Post-pivot cleanup (same date): the public home page no longer references sessions at all — no sign-in link, no session-loading state (faster first paint); the console link is not exposed publicly; `/login` is robots-disallowed.
- Terms/Privacy/DMCA pages exist as plain-language drafts (`/terms`, `/privacy`, `/dmca`, footer-linked). They are explicitly not legal advice; the owner must read them, set real contact addresses in `src/lib/site.ts`, and adjust jurisdiction specifics before real users arrive.

## Not complete yet

- Automated verification worker and safe redirect/domain checks.
- Appeal flow for reported resources (owner reinstates manually today).
- Integration tests, database migration tests, and production deployment checks.
- Cash-equivalent redemption remains closed (`REDEMPTIONS_ENABLED=0`) until the loyalty model ships.

Do not describe this checkpoint as production-ready. It has not been run against the user's Supabase project in this environment.
