# LinkDrop Deployment Checklist

## 1. Repository integrity

- [ ] Review the final versions of `src/lib/server.ts`, all API routes, UI pages, schema, and migrations together.
- [ ] Confirm imports, response shapes, database columns, enum values, and RPC argument names match across files.
- [ ] Confirm `package.json` scripts match the commands used by CI and deployment.
- [ ] Check `.gitignore` excludes `.env*` files except the committed example file.
- [ ] Confirm no real credentials or private user data are committed.

## 2. Environment

- [ ] Configure `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Configure `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Configure `SUPABASE_SERVICE_ROLE_KEY` only in server-side deployment secrets.
- [ ] Set the production site URL if the app uses it for redirects or origin validation.
- [ ] Configure equivalent variables separately for local, staging, and production.
- [ ] Run `node scripts/verify-linkdrop-env.mjs` in the configured environment.
- [ ] Confirm environment checking does not print secret values.

## 3. Database

- [ ] Take a recoverable backup before changes to an existing database.
- [ ] Apply migrations to staging first.
- [ ] Verify every referenced table, column, enum, index, function, and constraint exists with the expected type and behavior.
- [ ] Verify admin authorization is backed by a server-checked database record.
- [ ] Verify RLS and grants are intentional; service-role access bypasses RLS and must remain server-only.
- [ ] Test duplicate submissions and simultaneous moderation requests.
- [ ] Verify reward mutations cannot double-credit users. Keep rewards disabled until ledger transitions and redemption are atomic and tested.
- [ ] Test restoring a backup in an isolated environment.

## 4. Authentication and authorization

- [ ] Test signup, sign-in, sign-out, session expiry, and email confirmation behavior.
- [ ] Test every protected API without a session.
- [ ] Test a regular contributor against every admin endpoint.
- [ ] Test a disabled admin and a revoked admin session.
- [ ] Verify ownership checks prevent users from reading or modifying another user's submissions.
- [ ] Verify redirects and origin checks work with the actual production domain.

## 5. Public resolver and submissions

- [ ] Resolver returns only approved and published resources.
- [ ] Pending, rejected, disabled, and unknown resources are not publicly exposed.
- [ ] Invalid Instagram URLs, oversized inputs, unsupported schemes, and malformed JSON fail safely.
- [ ] Rate limits apply to the intended identity and endpoint, including concurrent requests.
- [ ] External destinations are not fetched by the server unless SSRF protections have been implemented and tested.
- [ ] Takedown/unpublish behavior is verified against the public resolver.

## 6. Quality gates

- [ ] Install dependencies from the lockfile using the repository's supported package manager.
- [ ] Run lint if configured.
- [ ] Run typecheck if configured.
- [ ] Run automated tests if configured.
- [ ] Run the production build.
- [ ] Run `node scripts/linkdrop-preflight.mjs` and review every warning; a static scan is not a substitute for tests.
- [ ] Perform a manual staging smoke test on desktop and mobile.

## 7. Launch and operations

- [ ] Configure error monitoring and access-controlled logs.
- [ ] Configure backup and restore ownership.
- [ ] Establish an incident-response contact and resource-takedown process.
- [ ] Publish an accurate privacy notice and resource verification explanation.
- [ ] Confirm legal contact and support channels work.
- [ ] Document the rollback procedure and the last known-good deployment.
- [ ] Launch to a small, monitored audience before broad promotion.

## Release rule

Any unchecked security, migration, authorization, or recovery item blocks a production launch. A successful file-generation log does not establish that the application builds, migrations succeed, or security tests pass.