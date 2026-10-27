# LinkDrop Integration Audit

## Run locally

From the project root:

```bash
node scripts/linkdrop-contract-audit.mjs
node scripts/linkdrop-preflight.mjs
```

These are static heuristic checks. They do not connect to Supabase and cannot prove that the application builds or that SQL executes successfully.

## Resolve failures first

1. Confirm `supabase/schema.sql` represents the intended fresh-database baseline.
2. Review migrations in lexical order and check whether each migration assumes tables or columns created by earlier migrations.
3. Check for duplicate object creation, incompatible enum values, missing columns, and RPC signatures that differ from API calls.
4. Confirm `admin_users` is created before any function or route that queries it.
5. Confirm `requireAdmin` validates the current authenticated user against the database on the server. A client-side page gate is not sufficient.
6. Confirm the admin route's expected RPC parameters exactly match the SQL function signature and argument names.
7. Confirm the resolver selects only published/approved resources and returns no internal moderation evidence.
8. Confirm contributor endpoints enforce ownership and derive user IDs from the verified session, not request JSON.

## Validate against a disposable Supabase project

- Start with an empty database or a disposable local Supabase instance.
- Apply the baseline schema using the documented setup procedure.
- Apply each migration in order.
- Stop on the first SQL error; do not skip a migration to make later files run.
- Inspect created tables, indexes, grants, RLS policies, and function definitions.
- Run negative authorization tests before testing normal user flows.
- Repeat the process in staging before touching production.

## Build and runtime validation

Inspect `package.json` and run only scripts that actually exist. A typical validation sequence, if configured, is:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Do not assume every command is defined. If the lockfile or script is absent, resolve that deliberately rather than inventing a successful result.

## Critical contract checks

- `server.ts` exports the exact helpers imported by all API routes.
- Auth helpers return the shape each caller expects.
- The browser UI sends the same JSON property names the API validates.
- API response shapes match the UI's parsing logic.
- Every table and column referenced in a query exists with the correct type.
- Every RPC argument matches the database function signature.
- The rate-limit RPC denies requests atomically under concurrency.
- Moderation approval and publication occur atomically and cannot approve the same pending submission twice.
- Reward crediting and redemption remain disabled until ledger semantics are safe, idempotent, and transactional.

## Reporting results

Record each finding as `confirmed`, `not reproduced`, or `not tested`. A static script warning is not automatically a defect, and a clean static scan is not a security certification.