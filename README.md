# LinkDrop

Community-powered directory for resource links associated with Instagram posts and Reels. Search a post → if the resource is missing, anyone can add it anonymously → it publishes **instantly**. A single report hides a link until the owner reviews it. No accounts required to contribute, no scraping, no private DMs.

## Phase 2b (2026-10-27, later the same day): monetized placements + owner console

- **Sponsored search gate** (`src/components/sponsor-gate.tsx` + `GET /api/public/sponsor`): clicking “Find resource” opens a 5-second skippable interstitial. When a promotion is live it shows that ad (`rel="nofollow sponsored"`, honest fine print); otherwise it shows the “slot is earned, not bought” house card. It never invents ad content. Knobs: `SKIP_SECONDS`, `COOLDOWN_MS` (per-visitor frequency cap).
- **Live presence pulse** (`src/components/live-presence.tsx`): real “people here right now” counter via Supabase Realtime presence. If Realtime is unavailable it renders nothing — LinkDrop never shows a fabricated viewer number.
- **Owner console Overview tab** (`GET /api/admin/overview` + `console/overview-tab.tsx`): live directory health (resources, covered posts, attributed links, last add), report volume, promo pipeline, and the current podium — clickable into the queues.
- Fair-play messaging across the home page, gate, and leaderboard: rank is computed automatically from genuinely-live links; no payments, no bidding — only owner content-vetting.

## Phase 2 (2026-10-27): username accounts, live leaderboard, earned promo slots — count-based, no points

There is **no points economy and no earning** anywhere in phase 2. The loop:

1. Share genuine links through the normal anonymous instant-publish form — signed in or not. It publishes instantly either way.
2. Signed-in submissions get **credited**: creating an account is just a **username + password** (no email; the auth identity is a synthesized `@users.linkdrop.internal` alias that is never shown, never emailed, never exposed). The account page lists every link the user submitted and their live standing.
3. `/leaderboard` ranks contributors **live** by the number of their links that are *genuine and currently live*. A reported (hidden) or permanently removed link drops out of the count automatically — no side-ledger to keep in sync; the count is computed from the same rows visitors see. Ties break by earliest first genuine link.
4. The **sponsor slot** on the home page (and a slim strip on landing pages) is **earned, not bought**: a top contributor (inside the top 3 with ≥ 5 live links — tunable via `PROMO_TOP_N` / `PROMO_MIN_LINKS` in `src/lib/site.ts`) can paste their own promotion (headline + direct https:// link, guidelines enforced). It lands *pending* in the console **Promotions** tab; once the owner approves, it renders for ~24 hours **and only while the user is still on top**, with `rel="nofollow sponsored"`.
5. Live counters on the home page show the real number of active resources and covered posts (`public_stats` RPC). Zero stays zero — no placeholders, no fake numbers.
6. Turnstile remains optional: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` and signup/report/submit all require the widget, **failing closed** on any uncertainty.

Everything above is backed by `supabase/migrations/0008_accounts_leaderboard.sql`: `profiles.username` (unique, `^[a-z0-9_]{3,20}$`), username-created IP hash, optional `p_submitter_id` attribution in `submit_public_link`, the `leaderboard_top` / `public_stats` / `contributor_rank` / `submit_promotion` / `admin_promotion_decide` / `active_promotion` RPCs (security definer, revoked from public roles, eligibility enforced **inside SQL**), and the `promotion_requests` table (RLS on, service-role only).

---

This is the 2026-10-27 pivot: growth over ceremony. The old account + reward system still exists in the codebase, but it is **dormant** — cash payouts stay disabled (`REDEMPTIONS_ENABLED=0`) and the ledger machinery is retained untouched.

## Run locally
1. Install Node.js 20.9+ and npm.
2. Run `npm install`.
3. Create a Supabase project and apply every migration in `supabase/migrations/` **in numeric order** (`0001_core_schema.sql` → `0008_accounts_leaderboard.sql`). `0001` recreates the foundational P0 schema for brand-new projects; `0002`–`0008` then reconcile and add the anonymous pivot, accounts, and leaderboard. `supabase/schema.sql` stays the reference draft — never run it ON TOP of a database that already has 0001 (they are the same starting point; 0001 is its executable form).
4. Copy `.env.example` to `.env.local`. Fill in the Supabase project URL, the publishable anon key, and the server-only service-role key. Administrator access is controlled by the `admin_users` table allowlist, not a shared token — add your own user ID there.
5. If port 3000 is occupied on your machine, run `npm run dev -- -p 3002` (or any free port). The console is at `http://localhost:PORT/admin` and also on `dashboard.localhost:PORT`.

> ⚠️ A historical revision of `.env.example` contained what looked like live
> Supabase keys. If any of those were real, rotate them: they must be treated
> as compromised.

## How the directory works
```
someone searches an Instagram post
  ├─ found    → resource card(s) shown, with a one-tap "Report this link"
  └─ not yet  → anonymous "add it" form (honeypot + rate limits server-side)
                publishing is INSTANT — no pending state, no moderation delay
any visitor can report → the resource is hidden immediately ("disputed")
                         → the owner reviews every report in the console
                         → Reinstate (live again) or Remove (delisted forever)
```
Anti-abuse layers on anonymous publishing: hidden `company` honeypot field, per-IP limit 5 submissions/hour, global limit 120/hour, optional Cloudflare Turnstile (it fails closed once configured), duplicate protection inside one race-safe database RPC, and IP addresses stored **only** as salted SHA-256 hashes, never raw.

Why not auto-ban IPs after reports: a single carrier-NAT IP can be thousands of real people, and a 3-strike auto-block is a griefing weapon. Enforcement stays a human decision in the console.

Signup/login (`POST /api/auth/username`) has its own layers: honeypot, per-IP signup limit 5/h (login 15/h), reserved-name lockout, shape-validated usernames `[a-z0-9_]{3,20}`, and the optional Turnstile. A legacy **email** account (the owner's, or pre-pivot contributors) still signs in by typing the email into the username field on the sign-in tab.

## What works (phases 1 + 2)
- Instagram Reel, post, and IGTV URL validation and normalization.
- Anonymous instant-publish submissions (`/api/public/submit`) with the protections above; a `no_admin_configured` database guard keeps publishing closed until an admin exists. Optional account attribution via bearer token (`p_submitter_id`), validated server-side against the active profile.
- One-report auto-hide (`/api/report` → `report_resource` RPC): each visitor can report a resource once; the first report flips it to `disputed`, which every resolver and the SEO landing page filter out.
- Per-post SEO landing pages at `/r/[code]` with `generateMetadata`, canonical URLs, OpenGraph, and a JSON-LD `ItemList` — this is where search traffic lands; plus the live sponsor strip.
- `sitemap.xml` (home, `/leaderboard`, every post with an active resource) and `robots.txt` (`/api/`, `/admin`, `/dashboard`, `/login` disallowed; `/leaderboard` indexable).
- Anonymous resolver (`/api/resolve`) returns only `active` resources plus the post code so the UI can link to `/r/[code]`.
- Username accounts (`POST /api/auth/username`), account page (`/dashboard`) with submitted links + live rank, public `/leaderboard` (server-rendered, ~15 s freshness), promotion request/evaluate flow for eligible contributors.
- Owner console (`/admin`, Reports + **Promotions** active; Moderation/Contributors/Payouts labelled dormant).
- Live counters + sponsor slot on the home page, all database-computed.
- HTTPS-only resource destinations, atomic moderation, database-backed rate limiting, baseline security headers.

## Demo content (phase 1 only — strip before launch)
Seed clearly-flagged demo posts/resources to exercise the whole loop — full owner walkthrough in `docs/PHASE1_RUNBOOK.md`:

```bash
npm run demo:seed     # 4 demo posts, 6 resources, 1 pre-quarantined resource + report
npm run demo:remove   # deletes every is_demo row, in FK-safe order
```

- Every demo row carries `is_demo = true` and URLs on `example.com`, so demo data can never be confused with real contributions — and demo rows are excluded from stats, the leaderboard, and promo eligibility by SQL.
- **Publishing rule: demo data must be removed before launch.** Counters and the leaderboard may only ever show real numbers — seeding fake traffic numbers as real would be the "claim big" trap.

## Rewards and payouts (dormant, owner-controlled)
- **Cash payouts remain OFF.** The pivot killed the cash-for-links loop because anonymous instant publishing changes the threat model completely; link quality is now enforced by reports, not by payouts. Set `REDEMPTIONS_ENABLED=1` to reopen contributor payouts.
- **There is no points earning in phase 2** (owner decision: count-based leaderboard only). The 0006 ledger machinery (25 points per approval, atomic reservations, append-only ledger) is untouched and idle; nothing in the phase-2 UI references it.
- If it is ever reopened: contributors earn 25 points (`v1`) on approval credited atomically with idempotency keys, balances computed in-database from the append-only ledger, payout requests reserved under an advisory lock, owner marks paid/progress/rejected in the console.

## Owner console subdomain
Any host starting with `dashboard.` is rewritten by `src/middleware.ts` to the console at `/admin`. To use it in production:

1. Point `dashboard.example.com` (CNAME) to the same deployment as the apex domain.
2. The console is a regular route — no special build. Access stays protected by the `admin_users` allowlist plus Supabase Auth.
3. Locally, `dashboard.localhost:PORT` resolves to 127.0.0.1 on modern systems, so you can exercise the exact production behavior during development.

## Before public launch
Follow `docs/PHASE1_RUNBOOK.md` (apply migrations → `npm run check:db` → `demo:seed` → rehearse → `demo:remove`).

This is an MVP, not a security audit. The rate limiter coordinates through a database RPC but should be load-tested. Still recommended: shared/bot protection at the edge (Turnstile in production is strongly advised once anonymous traffic becomes real), link-threat scanning, monitoring, backups, automated security tests, and legal review **before ever enabling cash-equivalent redemption** (`docs/archive/P4_PRIVACY_AND_CONTENT_POLICY.md`, `docs/archive/P3_REWARD_LEDGER_AND_INVARIANTS.md`). Do not fetch arbitrary submitted URLs from the server (SSRF risk).

Legal pages (`/terms`, `/privacy`, `/dmca`) ship as honest plain-language drafts — review them, replace the `YOUR-*-EMAIL` placeholders in `src/lib/site.ts`, and have someone with local-law eyes on them before you call them final.

Checklist before the first real user:
1. Every migration applied (0001 → 0008); `npm run audit:contracts` passes; `npm run check:db` shows all expected columns and phase-2 RPCs.
2. `npm run demo:remove` — zero demo rows left.
3. An admin user exists in `admin_users` (otherwise publishing stays closed by design).
4. Set `NEXT_PUBLIC_SITE_URL` to the production domain so `sitemap.xml`, `robots.txt`, and canonical URLs are correct.
5. Optional hardening: `TURNSTILE_SECRET` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, dedicated `IP_HASH_SALT`.
6. Submit the sitemap in Google Search Console once deployed at the real domain.
