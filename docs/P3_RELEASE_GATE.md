# LinkDrop P3 — Release gate

Use this checklist before calling a deployment production-ready. Generated code and static checks do not substitute for these tests.

## 1. Local checks

- [ ] Install from the committed lockfile (`npm ci` where supported).
- [ ] Run the repository's type-check command.
- [ ] Run lint and automated tests.
- [ ] Run `npm run build`.
- [ ] Run `node scripts/linkdrop-preflight.mjs` and resolve every failure; investigate every warning.
- [ ] Inspect the final diff for accidental secrets, unrelated file replacements, and debug logging.

## 2. Supabase and migrations

- [ ] Back up the database before changing a populated environment.
- [ ] Review `schema.sql` and every migration in order against the actual database.
- [ ] Confirm enum values, column names, foreign keys, and RPC parameter types match the route code.
- [ ] Confirm `admin_users` exists before any function or route that depends on it.
- [ ] Apply migrations first in a disposable staging project, not directly in production.
- [ ] Verify RLS is enabled on all tables exposed to the API and that untrusted client roles have no unintended policies.
- [ ] Confirm service-role credentials are only available to server-side code and are not prefixed with `NEXT_PUBLIC_`.
- [ ] Test backup restoration, not just backup creation.

## 3. Authentication and authorization

- [ ] Signed-out requests cannot submit resources, inspect contributor history, or moderate submissions.
- [ ] Contributor A cannot read Contributor B's private submissions or private account data.
- [ ] A normal contributor cannot access admin APIs by editing browser state or calling endpoints directly.
- [ ] A disabled admin is denied server-side even if their browser session remains active.
- [ ] Admin provisioning and revocation are documented and audited.
- [ ] Origin/CSRF protections match the actual authentication model; do not rely on CORS as authorization.

## 4. Resolver and submissions

- [ ] Public resolution returns approved/published records only.
- [ ] Unknown, pending, rejected, and removed resources do not leak through alternate endpoints.
- [ ] Invalid Instagram URLs, malformed bodies, oversized payloads, and unsupported URL schemes are rejected.
- [ ] Normalization and deduplication are consistent across submission and resolution.
- [ ] Rate limits work across multiple application instances and do not reset on every request.
- [ ] Duplicate concurrent submissions cannot create duplicate published resources.
- [ ] If any server-side URL fetch is introduced, enforce an allowlist, reject private/loopback/link-local IPs, revalidate every redirect, limit response bytes and time, and block unsafe ports and schemes.

## 5. Moderation and rewards

- [ ] Approve/reject is atomic, with a durable review record.
- [ ] A repeated review request cannot publish duplicate resources or duplicate rewards.
- [ ] Review notes are length-limited and rendered as text, never trusted HTML.
- [ ] Published resource URL changes are versioned and auditable.
- [ ] Reward credit is idempotent and computed server-side.
- [ ] Pending/posted/voided behavior is compatible with the append-only ledger design.
- [ ] Redemption uses an atomic balance reservation and cannot overspend under concurrency.
- [ ] Points with redeemable or monetary value remain disabled until ledger invariants and abuse controls pass.

## 6. Operations and privacy

- [ ] Logs contain request IDs and useful error codes without passwords, tokens, private evidence, or unnecessary personal data.
- [ ] Rate limits, database failures, and moderation RPC failures are observable.
- [ ] Takedown/report workflow has a documented owner and response process.
- [ ] User-submitted evidence has retention limits and access controls.
- [ ] Privacy policy and terms explain what is stored and why.
- [ ] Monitoring and alerts exist for abuse spikes, failed logins, and repeated resolver failures.
- [ ] Recovery procedure exists for accidental publication, compromised admin access, and leaked credentials.

## 7. Release decision

Do not mark production-ready while any critical authorization, migration, privacy, or reward-accounting check remains unverified. Record the commit, migration versions, test output, deployment date, and rollback owner for every release.
