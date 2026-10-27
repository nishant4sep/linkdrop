# P5 — Schema diagnostics

## What changed

- Added `.env.example` with variable names only.
- Added a read-only SQL diagnostic script to inspect the live database's columns, function signatures, RLS policies, constraints, indexes, and enum values.

## Why we are not adding `submissions.submitted_by` yet

The static audit could not confirm that column in a `CREATE TABLE` block. Automatically adding it could create a second source of truth if the existing schema uses a different contributor column, or fail because of existing rows and constraints. Inspect the live schema and the current `supabase/schema.sql` first.

## Migration-order warning

Migration `0003` references `admin_users`, while migration `0004` creates it. This is not automatically proof that migration `0003` fails: PostgreSQL may defer resolving a table reference inside a PL/pgSQL function body until that function executes. However, a direct SQL statement or another object created in `0003` that requires the table immediately could fail. Review the actual SQL and test the full chain against a disposable database before production.

Do not rename migrations or apply `0004` out of order to a populated database without reviewing the migration history and deployment state.

## Next validation

1. Open the Supabase SQL Editor for the intended project.
2. Run `supabase/diagnostics/linkdrop_schema_audit.sql`.
3. Save the result for the core tables and both RPC functions.
4. Run `npm run build` from the project directory and share the complete first error, if any.
5. Do not expose environment values, API keys, user emails, or private submission data in pasted output.

These diagnostics are observational. They do not apply migrations, change permissions, or certify the application.