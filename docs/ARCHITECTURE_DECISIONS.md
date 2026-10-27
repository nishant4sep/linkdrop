# LinkDrop — Architecture Decisions

Status: implementation plan; not a claim that integrations are already deployed.

## Product

LinkDrop is a worldwide resource index for Instagram posts and Reels. A user submits a public Instagram URL and LinkDrop returns a matching resource only when it has been submitted, reviewed, and published. LinkDrop does not promise to retrieve private Instagram DMs from a post URL. Any future Instagram integration must use authorized APIs and comply with platform rules.

## Target stack

- Frontend and application hosting: Cloudflare Workers with the supported Next.js deployment adapter. Cloudflare Pages is suitable for a static frontend, but must not be assumed to run the existing Next.js API routes unchanged.
- Database: Neon PostgreSQL. Use versioned SQL migrations, least-privilege database roles, transactions, constraints, and backups.
- Authentication: Clerk. Use server-side session verification for protected actions. A signed-in session alone never grants administrator privileges.
- Email: Resend for verification, notifications, moderation outcomes, and payout status. Email delivery is not an authorization mechanism.
- Object storage: Cloudflare R2 for optional user uploads and evidence. Private by default; signed, short-lived access where required; enforce size/type limits and retention policies.

## Migration rule

Do not switch production traffic until the replacement database schema, authentication, authorization, API routes, moderation workflow, and rollback plan have been tested. Preserve the current Supabase deployment until the new stack has passed those checks. Do not run the old Supabase migrations against Neon.

## Authentication and demo access

- Use Clerk's development/test mode for local development.
- Do not ship a hardcoded shared username/password or embed administrator credentials in source code.
- Provide a clearly labelled demo environment with synthetic data and read-only permissions. Demo access must not reach production records or execute payouts.
- Bootstrap the first real administrator through a one-time server-side setup process or an explicit trusted administrator allowlist. Never grant admin status because a user knows a URL, token exposed to a browser, or email address alone.

## Moderation

Every submitted resource begins pending and remains invisible in public resolution until an authorized reviewer approves it. Record the submitter, reviewer, decision, timestamp, and reason. Support rejection, duplicate detection, dispute reporting, removal, and an auditable history. Protect review endpoints with server-side role checks and rate limits.

## Rewards and cash payouts

The reward ledger must be append-only and idempotent. Award credit only after a valid resource is approved and fraud checks pass. Keep available, pending, redeemed, reversed, and disputed balances distinct. A redemption request reserves funds transactionally; it must not mark money as paid merely because a request was created.

Worldwide cash payouts are disabled until a payout provider is selected and eligibility, country coverage, identity checks, sanctions screening where applicable, tax reporting, fees, minimum thresholds, chargeback/fraud handling, and legal obligations have been reviewed. Never store payment-card or bank credentials directly. Do not promise that every country can receive payouts.

## Sponsors and advertisements

Admin-managed sponsor placements must have explicit status, placement, destination URL, start/end dates, and audit history. Validate destinations, prevent script/HTML injection, label paid placements as sponsored, and provide a global kill switch. Do not allow sponsors to influence verification decisions or purchase verification outcomes.

## Security requirements

- Keep database credentials, Clerk secret keys, Resend API keys, R2 secrets, and payout credentials server-side only.
- Validate all input on the server and use parameterized SQL.
- Rate-limit authentication-sensitive, resolution, submission, moderation, and redemption operations.
- Protect against CSRF where relevant, open redirects, SSRF, unsafe URL schemes, XSS, SQL injection, replay, duplicate rewards, and privilege escalation.
- Never fetch arbitrary user-provided URLs from the server without strict destination validation, DNS/IP checks, redirect controls, timeouts, and response-size limits.
- Minimize personal data; define deletion, retention, incident response, and audit-log policies.
- Use separate development and production credentials and databases.

## Release gates

Do not launch publicly until database migrations, authentication, administrator authorization, moderation, rate limits, backups, privacy/terms, error monitoring, abuse reporting, and production deployment have been tested. A successful local build alone is not production readiness.
