# LinkDrop Operations Runbook

## Status

This runbook defines the minimum operating procedure. It does not certify the current deployment as production-ready.

## Before deployment

1. Confirm the target Supabase project and environment.
2. Back up the database before applying migrations to a populated project.
3. Review every migration against the actual current schema. Do not assume migration numbering alone proves compatibility.
4. Apply migrations in order in a staging project first.
5. Create the first admin only after verifying the intended account's Supabase Auth user ID through a trusted administrative channel.
6. Keep the service-role key server-side. Never place it in a `NEXT_PUBLIC_` variable, client bundle, repository, screenshot, or public log.
7. Run the environment check and the repository's actual lint, typecheck, test, and build commands where available.
8. Test unauthenticated access, contributor access, non-admin access, admin access, and public resolution separately.

## Admin provisioning and removal

- Grant admin access only to named, trusted operators who need it.
- Verify the user's Auth UUID independently before inserting an admin record.
- Do not create an admin account by trusting a client-submitted email or user ID.
- Record who authorized the grant and why, using an approved audit process.
- To revoke access, disable or remove the admin record according to the deployed schema, then invalidate active sessions if the incident warrants it.
- Verify revocation using a fresh request. Hiding an admin page in the browser is not authorization.

## Incident response

### Suspected leaked secret

1. Revoke or rotate the affected credential immediately in its provider dashboard.
2. Update deployment secrets and redeploy.
3. Review provider audit logs and application logs for suspicious use.
4. Determine whether user data or database contents may have been accessed or changed.
5. Record the incident, timeline, impact, and remediation.
6. Do not paste live credentials into issue trackers or chat logs.

### Malicious, incorrect, or rights-infringing resource

1. Unpublish or disable the affected resource through a verified server-side administrative process.
2. Confirm the public resolver no longer returns it.
3. Preserve the minimum evidence needed for an audit without unnecessarily copying personal data.
4. Review the source, submission history, and moderation decision.
5. Notify affected parties when appropriate and legally required.
6. Add a regression test or rule to reduce recurrence.

### Abuse or unusual traffic

1. Apply a temporary block or rate limit at the edge where appropriate.
2. Inspect request volume, failure rates, account activity, and relevant audit events.
3. Avoid publishing raw IP addresses, tokens, or private submission evidence in incident reports.
4. Restore normal access only after the abuse path has been addressed.

## Database backup and recovery

- Configure backups according to the chosen Supabase plan and acceptable recovery-point objective.
- A backup is not proven usable until a restore has been tested in an isolated environment.
- Before a risky migration, create a recoverable backup and record the migration version.
- Never test destructive recovery procedures on the production database.
- Document who can restore the database and who can approve a production recovery.
- Keep exported backups access-controlled and encrypted where supported.

## Monitoring

At minimum, monitor:

- application errors and elevated API failure rates;
- authentication failures and repeated submission attempts;
- rate-limit rejections;
- moderation volume and unresolved cases;
- unexpected changes in published resources;
- database availability, backup completion, and storage usage.

Logs must not contain passwords, access tokens, service-role keys, or unnecessary personal data. Define a retention period and restrict log access.

## Rollback

1. Identify the last known-good application deployment and database migration state.
2. Roll back the application if safe to do so.
3. Do not assume a database migration can be reversed automatically.
4. Prefer a reviewed forward-fix when a migration has already changed production data.
5. Restore a backup only under an approved recovery plan, accounting for data written since the backup.
6. Verify login, submission, moderation, and public resolution after recovery.

## Go-live decision

Do not launch publicly until the release gate is complete, the migration chain is verified against the real schema, authorization checks pass, and a tested recovery path exists.