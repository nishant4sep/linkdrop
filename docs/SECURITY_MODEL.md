# LinkDrop security model

## Trust boundaries

- The browser is untrusted. All submitted URLs, descriptions, headers, and evidence links require validation.
- The Supabase service-role key is server-only. It must never appear in a `NEXT_PUBLIC_` variable, client bundle, source control, logs, or error response.
- Public resolution may return published resources only. Contributor identity, evidence, moderation history, unpublished links, and reward records are private.
- Administrator status comes from `public.admin_users`; a frontend flag, email address supplied in a request, or shared password is not authorization.

## Authentication and authorization

- Protected routes must call `requireUser` and verify the returned user ID against ownership/role data for each operation.
- Admin routes must call `requireAdmin` on every request.
- The admin allowlist migration intentionally grants no direct browser policies. Manage grants through a trusted database operator or a separately audited admin-provisioning process.
- Do not put service-role credentials in the client or use them as a substitute for checking the current user's permissions.

## URL handling

- Canonicalize Instagram URLs before database lookup and enforce a unique canonical identity in the database.
- Do not automatically fetch arbitrary destination URLs from the web request path.
- If a future worker fetches URLs, it needs DNS resolution checks, IPv4/IPv6 private and special-use address blocking, redirect revalidation at every hop, strict timeouts, response-size limits, content-type limits, and network-level egress restrictions. A hostname-only validation is not sufficient against SSRF.
- A valid HTTPS URL does not establish ownership, authenticity, availability, safety, or permission to redistribute the linked content.

## Publication and rewards

- Only an explicit moderation/verification transition may publish a resource.
- Never return pending or quarantined resources from the public resolver.
- Reward grants must be idempotent, server-side, and tied to an auditable submission/review event. Do not let clients write reward ledger entries or balances.
- Treat creator takedowns, dead links, duplicate submissions, conflicts, suspicious reward farming, and rights complaints as first-class states.

## Before production

Run auth/role tests, migration tests, URL canonicalization tests, duplicate/conflict tests, published-only resolver tests, and abuse/rate-limit tests. Verify that errors do not expose SQL details, tokens, private contributor data, or unreviewed URLs.
