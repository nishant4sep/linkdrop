# LinkDrop

Community-powered directory for resource links associated with Instagram posts and Reels. Search a post → if the resource is missing, anyone can add it anonymously → it publishes **instantly**. A single report hides a link until the owner reviews it. No accounts required to contribute, no scraping, no private DMs.

This is the 2026-10-27 pivot: growth over ceremony. The account + reward system still exists in the codebase, but it is **dormant** — cash payouts are disabled by default (`REDEMPTIONS_ENABLED=0`) and the ledger machinery is retained for the upcoming loyalty-points model.

## Run locally
1. Install Node.js 20.9+ and npm.
2. Run `npm install`.
3. Create a Supabase project and apply every migration in `supabase/migrations/` in order (0001 → 0007). The migrations are self-sufficient for a database started from the practical baseline (no `schema.sql` needed). `supabase/schema.sql` remains only a design draft for brand-new projects; do not apply it on top of an already-migrated database.
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
Anti-abuse layers on anonymous publishing: hidden `company` honeypot field, per-IP limit 5 submissions/hour, global limit 120/hour, optional Cloudflare Turnstile (set `TURNSTILE_SECRET` to switch it on — it fails closed), duplicate protection inside one race-safe database RPC, and IP addresses stored **only** as salted SHA-256 hashes, never raw.

Why not auto-ban IPs after reports: a single carrier-NAT IP can be thousands of real people, and a 3-strike auto-block is a griefing weapon. Enforcement stays a human decision in the console.

## What works (phase 1)
- Instagram Reel, post, and IGTV URL validation and normalization.
- Anonymous instant-publish submissions (`/api/public/submit`) with the protections above; a `no_admin_configured` database guard keeps publishing closed until an admin exists.
- One-report auto-hide (`/api/report` → `report_resource` RPC): each visitor can report a resource once; the first report flips it to `disputed`, which every resolver and the SEO landing page filter out.
- Per-post SEO landing pages at `/r/[code]` with `generateMetadata`, canonical URLs, OpenGraph, and a JSON-LD `ItemList` — this is where search traffic lands.
- `sitemap.xml` (every post with an active resource) and `robots.txt` (`/api/`, `/admin` disallowed).
- Anonymous resolver (`/api/resolve`) returns only `active` resources plus the post code so the UI can link to `/r/[code]`.
- Owner console (`/admin`, four tabs): **Moderation** (legacy account-based queue, still functional), **Reports** (the new reported-links queue with Reinstate/Remove + audit note), **Contributors**, **Payouts** (dormant while `REDEMPTIONS_ENABLED=0`).
- HTTPS-only resource destinations, atomic moderation, database-backed rate limiting, baseline security headers.

## Demo content (phase 1 only — strip before launch)
Seed clearly-flagged demo posts/resources to exercise the whole loop — full owner walkthrough in `docs/PHASE1_RUNBOOK.md`:

```bash
npm run demo:seed     # 4 demo posts, 6 resources, 1 pre-quarantined resource + report
npm run demo:remove   # deletes every is_demo row, in FK-safe order
```

- Demo fixtures live on `/r/demoReel01` … `/r/demoReel04`; `/r/demoReel02` demonstrates the reported/hidden flow (its only resource is pre-quarantined so you can reinstate or remove it from the Reports tab).
- Every demo row carries `is_demo = true` and URLs on `example.com`, so demo data can never be confused with real contributions.
- **Publishing rule: demo data must be removed before launch.** Live counters and leaderboards planned for phase 2 may only ever show real numbers — seeding fake traffic numbers as real would be the "claim big" trap.
- `scripts/demo-names.json` is phase-2 material: demo usernames for the leaderboard seeding, not yet used by any route.

## Rewards and payouts (dormant, owner-controlled)
- **Currently OFF.** The pivot killed the cash-for-links loop because anonymous instant publishing changes the threat model completely; link quality is now enforced by reports, not by payouts. Set `REDEMPTIONS_ENABLED=1` to reopen contributor payouts.
- When enabled, everything below remains true (none of it was deleted): contributors earn **25 points (rule `v1`)** when a submission is approved, credited by the atomic moderation RPC with an idempotency key — approvals can never double-pay.
- Balances are never stored in a column: computed from the immutable, append-only ledger minus in-flight reservations, always inside the database.
- Payout requests are validated and reserved atomically under a per-contributor advisory lock; the owner marks them paid / in progress / rejected in the console. The payout channel itself is external (UPI, bank transfer, …), recorded manually.
- The owner also controls contributors directly (view balances and history, suspend/reactivate accounts).
- Phase 2 plan: the same ledger becomes the loyalty-points system — top contributors earn promoted slots on the home page, with a public leaderboard and explicit "Promoted" labels.

### How the dormant money flow still works
```
contributor submits link → admin approves (RPC posts the earn entry)
contributor requests payout (RPC reserves points atomically)
owner delivers payment on their own channel, then marks it paid
(RPC: redemption → paid + ledger debit, one transaction)
```

## Owner console subdomain
Any host starting with `dashboard.` is rewritten by `src/middleware.ts` to the console at `/admin`. To use it in production:

1. Point `dashboard.example.com` (CNAME) to the same deployment as the apex domain.
2. The console is a regular route — no special build. Access stays protected by the `admin_users` allowlist plus Supabase Auth.
3. Locally, `dashboard.localhost:PORT` resolves to 127.0.0.1 on modern systems, so you can exercise the exact production behavior during development.

## Before public launch
Follow `docs/PHASE1_RUNBOOK.md` step by step (apply 0007 → `check:db` → `demo:seed` → rehearse the loop → `demo:remove` → launch checklist).

This is an MVP, not a security audit. The rate limiter coordinates through a database RPC but should be load-tested. Still recommended: shared/bot protection at the edge (Turnstile in production is strongly advised once anonymous traffic becomes real), link-threat scanning, monitoring, backups, automated security tests, and legal review **before ever enabling cash-equivalent redemption** (`docs/P4_PRIVACY_AND_CONTENT_POLICY.md` and `docs/P3_REWARD_LEDGER_AND_INVARIANTS.md`). Do not fetch arbitrary submitted URLs from the server (SSRF risk).

Legal pages (`/terms`, `/privacy`, `/dmca`) ship as honest plain-language drafts — review them, replace the `YOUR-*-EMAIL` placeholders in `src/lib/site.ts`, and have someone with local-law eyes on them before you call them final.

Checklist before the first real user:
1. Every migration applied (0001 → 0007); `npm run audit:contracts` passes.
2. `npm run demo:remove` — zero demo rows left.
3. An admin user exists in `admin_users` (otherwise publishing stays closed by design).
4. Set `NEXT_PUBLIC_SITE_URL` to the production domain so `sitemap.xml` and `robots.txt` emit correct absolute URLs.
5. Submit the sitemap in Google Search Console once deployed at the real domain.
