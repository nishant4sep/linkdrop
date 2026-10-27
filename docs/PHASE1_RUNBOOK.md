# Phase 1 runbook — anonymous directory (owner steps)

Phase 1 pivoted LinkDrop to: **search → miss → add anonymously → published instantly → one report hides it → you review it in the console.** No accounts to contribute, no cash rewards (dormant, `REDEMPTIONS_ENABLED=0`). This page is the exact order of operations to get from here to a public launch.

## 0. What is already done
- Migrations 0001–0006 applied on your Supabase project; owner account created in `admin_users` (console access verified working on your machine).
- All phase-1 code built and verified: `npx tsc --noEmit` clean, `npm run lint` clean, 28/28 tests pass, `npm run build` succeeds (`audit:contracts` passes with 0 warnings).
- Every visible dev number is clearly flagged demo data.

## 1. Apply migration 0007 (you do this by hand)

In Supabase → SQL Editor → paste and run the entire file `supabase/migrations/0007_anonymous_pivot.sql`.

It does:
- relaxes `submissions.submitted_by` (anonymous rows allowed), adds `source` / `submitted_ip_hash` / `is_demo`
- adds `canonical_post_id`, `is_demo`, `last_seen_at` to `posts`
- adds `submitted_ip_hash`, `is_demo` to `resources`
- creates the `resource_reports` table (one row per resource+visitor, unique)
- creates the three service-role RPCs: `submit_public_link`, `report_resource`, `admin_resolve_report`

It is safe on your current shape (all `if not exists` / `drop not null` style). Then verify:

```bash
npm run check:db
```

Expected: every expected column present on `posts`, `resources`, `submissions`, and `resource_reports` queryable. Until 0007 lands you will see exact `MISSING expected column(s)` lines — that is the probe doing its job.

## 2. Seed demo content (phase-1 rehearsal data)

```bash
npm run demo:seed
```

Seeds (all flagged `is_demo = true`, URLs on `example.com`, fingerprints `demo-fingerprint-*`):

| Fixture | Where to try it |
|---|---|
| `demoReel01` — preset reel, 2 resources | `/r/demoReel01` — live cards with Report UI |
| `demoReel02` — CapCut template, 1 resource — pre-quarantined by a demo report | `/r/demoReel02` — "Nothing shared yet" publicly + 1 item in your console **Reports** tab |
| `demoReel03` — Notion template reel, 2 resources | `/r/demoReel03` |
| `demoReel04` — icon pack reel, 1 resource | `/r/demoReel04` |

Re-running the seed is safe — it skips anything that already exists.

## 3. Rehearse the whole loop (localhost, port 3002 in your setup)

1. **Search a miss.** Home page → search a real reel you know has nothing listed → you get the "Nothing matched yet" box + the anonymous add form.
2. **Publish instantly.** Submit any `https://example.com/…` test URL → it should say "Published" immediately. Open `/r/<postCode>` — the card is already live. No pending state, no approval.
3. **Undo nothing needed:** your console **Moderation** tab stays empty for anonymous flow (that queue is the legacy account path — it keeps working when accounts return in phase 2).
4. **Report it.** On the card → Report → pick a reason → send → "now hidden while a human reviews" → reloading the post page shows nothing. Resolvers, `/r/<code>`, and the sitemap all filter `disputed` out.
5. **Same visitor can't spam reports:** report the same resource again from the same network → acknowledged, but it will not create a second hide. Reporting a **different** resource works immediately.
6. **Console review.** `dashboard.localhost:3002/admin` (or `/admin`) → **Reports** tab → the item shows the resource, its anonymous fingerprint, and your note field → **Reinstate** (live again) or **Remove permanently** (delisted). Every decision lands in `audit_logs` with your ID.
7. **Also rehearse with the pre-quarantined demo item:** `/r/demoReel02` is hidden on purpose so you can practice Reinstate/Remove before a real user ever files one.
8. **SEO surfaces.** `/robots.txt` (allows posts, blocks `/api/` + `/admin`), `/sitemap.xml` (now lists every post with an active resource — after 0007 applies it will no longer fall back to the homepage-only entry).

## 4. Before publishing this anywhere (hard checklist)

1. `npm run demo:remove` → run twice; the second run must print "No demo rows found".
2. `npm run audit:contracts` → 0 failures.
3. An admin still exists in `admin_users` — otherwise anonymous publishing is intentionally closed (`no_admin_configured`).
4. Production env: `NEXT_PUBLIC_SITE_URL=https://your-domain` (correct absolute URLs in sitemap/robots/canonicals), `REDEMPTIONS_ENABLED=0` (leave off), `IP_HASH_SALT=<random string>` (dedicated salt; rotating it resets fingerprint history), and set `TURNSTILE_SECRET` + the site key in the submit form when anonymous traffic is worth a bot gate — it fails closed once set.
5. Legal pages are live but generic: read `/terms`, `/privacy`, `/dmca`, replace the two `YOUR-*-EMAIL` placeholders in `src/lib/site.ts`, and adjust wording to your jurisdiction before launch.

## 5. What phase 2 is (next decisions, in owner language)

- Optional accounts with username + password + Turnstile (no email) → usernames connect to fingerprints for the leaderboard.
- Loyalty points on top of the existing reward ledger — approved submissions earn points; **cap promo slots, require approved-not-just-submitted contributions, label everything "Promoted"**.
- Live counters only ever showing real numbers (demo data gone, no fake "12,483 links" claims).
- Names for the seeded leaderboard demo live in `scripts/demo-names.json` (not used by any route yet).
- Phase 3: the ad gate decision is still open — options were (a) skippable ~3s reveal while the link is already loading beneath, (b) no gate, inline sponsored card only, (c) your original forced 4–5s. Nothing blocks links today.
