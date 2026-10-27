# LinkDrop P3 — Security test plan

## Identity and access

1. Call every protected API without a session; expect an authentication failure.
2. Call contributor APIs using two separate accounts; verify all reads and mutations are scoped to the authenticated user.
3. Call the admin API with a normal account; expect denial from the server, regardless of the UI route.
4. Disable an admin record and retry using the existing session; expect denial immediately or within the documented revocation window.
5. Attempt to supply another user's ID in the request body; the server must ignore it or reject the request and use the verified session identity.

## Input and URL handling

1. Test malformed JSON, missing fields, wrong data types, oversized strings, and invalid UUIDs.
2. Test Instagram URLs with unexpected hosts, credentials in URLs, non-HTTPS schemes, misleading suffixes, encoded delimiters, and malformed paths.
3. Confirm public resolver responses never contain pending or rejected resources.
4. If a fetch worker exists, test loopback, private IPv4/IPv6, link-local addresses, DNS rebinding, redirect-to-private-address, nonstandard ports, and oversized responses in an isolated environment.

## Concurrency and replay

1. Submit the same resource concurrently from multiple sessions.
2. Approve the same submission concurrently from two admin sessions.
3. Replay an identical review request after simulating a lost HTTP response.
4. Trigger repeated rate-limited requests from separate app instances.
5. Attempt two simultaneous redemptions whose total exceeds the available balance.
6. Simulate worker retries and verify idempotency keys prevent duplicate side effects.

## Audit and recovery

1. Verify every moderation decision records reviewer, decision, time, and reason where applicable.
2. Verify published-resource edits preserve version history.
3. Verify reward corrections create compensating events rather than erasing history.
4. Revoke admin access and verify the audit trail remains.
5. Restore a database backup in staging and verify the application can read it.

## Evidence

For each test, record environment, commit, request scenario, expected result, actual result, and pass/fail. Do not place live secrets, access tokens, or real users' private evidence in test artifacts.
