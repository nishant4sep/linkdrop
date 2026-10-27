# P2 — contributor and administrator UI

## Included

- Supabase browser client using the public anon key only.
- Email/password sign-in and account creation screen.
- Contributor workspace with resource submission form and private submission history.
- Authenticated `GET /api/me/submissions`, explicitly filtered by the verified user's ID.
- Administrator moderation queue with pending/approved/rejected filters.
- Approve/reject actions that call the atomic moderation RPC from P1.2.
- Visible warnings and confirmation before publishing a resource.

## Environment

Keep the public Supabase URL and anon key in the public environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never prefix it with `NEXT_PUBLIC_` and never expose it to a client component.

## Access setup

1. Configure Supabase Auth email/password and the email confirmation behavior for your development project.
2. Create a test contributor account through `/login`.
3. Grant administrator status to a separate test account by inserting that authenticated user's UUID into `public.admin_users` using the trusted SQL editor. Do not grant admin status from a browser request.
4. Test contributor routes and admin routes with separate accounts.

## Important checks

- The contributor history endpoint filters submissions by the verified user ID on the server.
- The admin page is not itself a security boundary; the API and database RPC enforce administrator access.
- `GET /api/admin/submissions` currently returns the post ID, not its canonical Instagram URL. Add a joined/secondary post lookup before relying on this UI for full review evidence.
- The admin queue must not be considered a complete verification system. It does not yet validate redirects, prove resource ownership, or confirm sharing rights.
- Ensure the project's Tailwind configuration supports the utility classes used by these pages. If the existing app does not use Tailwind, adapt the styling to its actual CSS setup.
- These files have not been compiled or run against a live Supabase project in this environment.

## Manual acceptance tests

1. Sign-up and sign-in work with Supabase Auth settings.
2. Signed-out users cannot submit or view submission history.
3. Contributor A cannot see Contributor B's submissions, even when manually changing request URLs.
4. A normal contributor cannot read the admin queue or call the review endpoint successfully.
5. A disabled admin account is denied access.
6. Admin approval publishes the resource and records a review entry atomically.
7. Admin rejection leaves no published resource.
8. Refreshing the contributor workspace shows updated status.
9. Invalid forms show actionable errors and do not publish anything.
10. Service-role credentials never appear in browser assets or network responses.
