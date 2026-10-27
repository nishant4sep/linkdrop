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

## Phase 2 — username accounts, live leaderboard, earned promo slots (2026-10-27)

Owner decision first: **no points, no rewards earning.** The loyalty economy is count-based: contributors ranked by how many of their links are genuine AND currently live; the top of the board earns the right to paste their own promotion.

Implemented in phase 2:

- `supabase/migrations/0008_accounts_leaderboard.sql`: `profiles.username` (`^[a-z0-9_]{3,20}$`, unique, NULL-tolerant for legacy accounts) + `username_created_ip_hash`/`_created_at`; leaderboard index `resources_submitter_status_idx`; `leaderboard_top` (live-only counts, tie-break earliest genuine link), `public_stats` (home counters, demo rows excluded), `contributor_rank` (rank + eligibility `rank ≤ top_n AND links ≥ min`), `submit_promotion` (eligibility enforced IN SQL, one pending/one approved per user via partial unique indexes), `admin_promotion_decide` (approve 24h window / reject / retire / extend + audit trail + auto-close of expired rows), `active_promotion` (renders ONLY while the winner is still eligible and in-window). All security definer, revoked from `public/anon/authenticated`, granted to `service_role`.
- `submit_public_link` gains optional `p_submitter_id`, validated against an active username profile; submissions record `source = 'account'` and resources record `submitted_by`. The old 7-arg signature is dropped (single canonical signature).
- `src/app/api/auth/username/route.ts`: signup + login without email — the auth alias is `<username>@users.linkdrop.internal`, recomputed at login so no username directory is needed for authentication. Honeypot, per-IP limits (signup 5/h, login 15/h), reserved-name lockout, Turnstile fail-closed when configured, username suggestions on taken names, compensating `deleteUser` if the profile insert fails. Legacy **email** accounts (the owner's) sign in through the same endpoint by including an `@` identifier.
- `/login` rebuild: two tabs (Sign in / Create account), honeypot + suggestions chips + optional Turnstile widget, session adopted client-side via `setSession`.
- `/dashboard` rebuild (account page): live rank card (live links / position / promo eligibility), "your submitted links", the promotion request form visible only to eligible users, guidelines, request history with owner notes. The points/payout UI was removed from the page (machinery stays dormant server-side).
- `/leaderboard` server page (~15 s freshness): real ranked names, honest empty state, rules card, current sponsor. `/api/leaderboard`-style access is SQL-only — the page reads `leaderboard_top` through the service role.
- Home page (`src/app/page.tsx`): server-rendered live counters (`public_stats`: active resources / posts covered) + sponsor slot under the search box; landing pages (`/r/[code]`) carry a slim sponsor strip. Sponsor links are `rel="nofollow sponsored"`.
- `src/app/api/me/promotions/route.ts` (GET eligibility + history; POST request, rate-limited 3/day, DB-enforced), `src/app/api/admin/promotions/route.ts` (GET queue with usernames + ranks; PATCH via `admin_promotion_decide`), console **Promotions** tab (`src/components/console/promotion-queue.tsx`).
- `submit-public.tsx` attaches the bearer token when a session exists — signed-in publishing is identical instant-publish, plus credit.
- Sitemap gains `/leaderboard`; robots unchanged (`/login`, `/dashboard` stay out; `/leaderboard` indexable).

Anti-fake/rate policy: stats and the leaderboard exclude `is_demo` rows; the sponsor slot re-verifies top-of-board per render; promo requests are 3/day/user; approval grants a 24 h window (extendable).

## Explicitly NOT implemented yet (do not claim otherwise in SEO or meta)

- Turnstile is optional and OFF until `TURNSTILE_SECRET` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are set — anonymous submissions/signups currently rely on honeypot + rate limits only.
- The ad gate before revealing links was deliberately NOT built in phase 1; the shape (skippable reveal vs. inline sponsored slot) is an owner decision still pending.
- Usernames/accounts for contributors, captcha'd signup, leaderboard, live counters, and promoted slots now EXIST (phase 2, see above) — in the count-based, no-points form the owner confirmed. Still NOT built: self-serve ad buying (the slot is earned + owner-approved only), appeal automation, and link-content verification (no destination is fetched server-side — SSRF by design stays out).
- Link-content verification (none of the destinations are fetched server-side — SSRF by design stays out).

Dormant-by-design (kept, not deleted, for the old points economy):

- `/api/submit` (the old account-based submission endpoint), `/api/me/rewards`, `/api/me/payouts`, and the reward ledger machinery. No public links point at them; nothing in the phase-2 UI references points.
- Console tabs `moderation`, `contributors`, `payouts` render with a "dormant" label; **Reports + Promotions** are the active queues.
- Historical phase docs (P1–P5, RELEASE_PLAN) moved to `docs/archive/`.

Post-pivot cleanup (same date): the public home page no longer references sessions at all — no sign-in link, no session-loading state (faster first paint); the console link is not exposed publicly; `/login` is robots-disallowed.
- Terms/Privacy/DMCA pages exist as plain-language drafts (`/terms`, `/privacy`, `/dmca`, footer-linked). They are explicitly not legal advice; the owner must read them, set real contact addresses in `src/lib/site.ts`, and adjust jurisdiction specifics before real users arrive.

## Not complete yet

- Automated verification worker and safe redirect/domain checks.
- Appeal flow for reported resources (owner reinstates manually today).
- Integration tests, database migration tests, and production deployment checks.
- Cash-equivalent redemption remains closed (`REDEMPTIONS_ENABLED=0`) until the loyalty model ships.

Do not describe this checkpoint as production-ready. It has not been run against the user's Supabase project in this environment.
