<div align="center">

# LinkDrop

**Find the resource behind any Instagram post.**

A community directory of resource links for Instagram posts and Reels, with a live contributor leaderboard.

[**Live demo**](https://linkdrop.nishvnt.workers.dev/) · [Report an issue](https://github.com/nishant4sep/linkdrop/issues)

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)

</div>

---

## What is LinkDrop?

Someone posts a Reel and says "link in bio" or "DM me for the link." LinkDrop is where the community collects those links in one searchable place.

Paste an Instagram post URL. If the resource has been added, you see it. If not, you can add it yourself and it goes live instantly. No scraping, no private DMs.

## How it works

1. **Search** an Instagram post, Reel, or IGTV URL.
2. **Find** the resource link, or **add it** if it's missing. It publishes immediately.
3. **Report** a bad link. One report hides it until the owner reviews it.
4. **Sign in** (optional) to get credit and climb the leaderboard.

## Features

- **Instant publishing.** Anyone can add a link, with or without an account.
- **Report and review.** One report hides a link right away. The owner then reinstates or removes it.
- **Username accounts.** Sign up with just a username and password. No email needed.
- **Live leaderboard.** Contributors are ranked by how many of their links are genuine and currently live. Reported or removed links drop out automatically.
- **Earned promo slot.** Top contributors can request a promotion, which goes live only after owner approval and only while they stay on top. Not for sale.
- **Search-friendly pages.** Every post gets its own page at `/r/[code]` with metadata, canonical URLs, and a sitemap.
- **Honest numbers.** Counters show real database values. Zero stays zero.
- **Anti-abuse basics.** Honeypot field, rate limits, optional Cloudflare Turnstile, and IPs stored only as salted hashes.

## Tech stack

| | |
|---|---|
| Framework | Next.js (TypeScript) |
| Styling | Tailwind CSS |
| Database and auth | Supabase |
| Hosting | Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare) |

## Run locally

Requires Node.js 20.9+.

```bash
git clone https://github.com/nishant4sep/linkdrop.git
cd linkdrop
npm install
cp .env.example .env.local
```

1. Create a Supabase project.
2. Apply every file in `supabase/migrations/` in numeric order (`0001` to `0008`).
3. Fill in `.env.local` (see [Environment variables](#environment-variables)).
4. Add your user ID to the `admin_users` table. Publishing stays closed until an admin exists.
5. Start the dev server:

```bash
npm run dev
```

The owner console is at `/admin`.

### Optional: demo data

```bash
npm run demo:seed     # add clearly flagged demo posts and resources
npm run demo:remove   # delete all demo data
```

Demo rows are excluded from stats and the leaderboard. Remove them before launch. See [`docs/PHASE1_RUNBOOK.md`](docs/PHASE1_RUNBOOK.md).

## Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build and runtime | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build and runtime | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime secret | Required. Bypasses RLS. Never expose it publicly. |
| `NEXT_PUBLIC_SITE_URL` | build and runtime | Your production URL |
| `IP_HASH_SALT` | runtime secret | Recommended |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | optional | Enables Turnstile on signup, report, and submit |
| `REDEMPTIONS_ENABLED` | runtime | Keep `0` |

## Deploy to Cloudflare Workers

| Setting | Value |
|---|---|
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |

Add the variables above in your Cloudflare project settings. Runtime variable changes apply only to **new deployments**, so retry the latest deployment or push to `main` after changing them.

After deploying, check that the home counters load, `/leaderboard` ranks correctly, an anonymous add publishes, a report hides a link, and `/admin` opens for an admin account. If a route errors, the first line in **Observability, Logs** usually names the missing variable.

## Project notes

- Cash payouts and the old points ledger still exist in the code but are **disabled**. The leaderboard is count-based only.
- This is an MVP, not a security audit. Before real traffic, consider Turnstile, link-threat scanning, monitoring, backups, and a legal review of `/terms`, `/privacy`, and `/dmca` (replace the `YOUR-*-EMAIL` placeholders in `src/lib/site.ts`).
- Do not fetch arbitrary submitted URLs from the server (SSRF risk).

More detail lives in [`docs/`](docs/).
