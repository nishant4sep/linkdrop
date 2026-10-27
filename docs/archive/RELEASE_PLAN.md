# LinkDrop — Release Plan

## Phase 1 — Stabilize the current app

- Fix the unstyled or missing layout shown in the current screenshots.
- Audit all existing routes and forms: home, login, dashboard, admin, resolver, submission, and moderation APIs.
- Add a proper responsive design system and accessible loading, empty, error, and success states.
- Add automated tests for route contracts, authentication gates, admin-only operations, duplicate submissions, and moderation decisions.
- Do not treat pages that render as proof that their backend works.

## Phase 2 — Move to the chosen stack

- Create a Neon database and apply a fresh, versioned PostgreSQL schema.
- Integrate Clerk using server-side authentication and explicit role checks.
- Add Resend only after domain verification and email templates are ready.
- Add R2 only for a real upload requirement; otherwise defer it to avoid unnecessary complexity.
- Deploy Next.js using a Cloudflare-supported Workers adapter, or split the frontend and API deliberately. Do not assume Cloudflare Pages supports the current server routes as-is.
- Keep the current deployment available until the new deployment passes acceptance tests.

## Phase 3 — Admin and moderation

- Review queue with approve/reject and reason.
- Searchable resource and submission history.
- Contributor status, abuse reports, disputes, removals, and audit events.
- Sponsor placements, display controls, scheduling, click tracking with privacy safeguards, and an emergency disable switch.
- Operational overview: submissions, approvals, rejection reasons, unresolved reports, and system health.

## Phase 4 — Rewards

- Implement a transactional, append-only internal ledger first.
- Add anti-fraud rules, duplicate detection, account abuse controls, and reviewer accountability.
- Test concurrent approvals, repeated requests, reversals, and redemption failures.
- Keep cash redemption disabled until a payout provider and compliance requirements have been validated for the supported countries.

## Phase 5 — Public launch

- Configure the custom domain, HTTPS, environment variables, and separate production credentials.
- Publish privacy policy, terms, content/takedown policy, reward rules, and sponsor disclosure.
- Test backup restoration, rate limiting, abuse response, logging, and rollback.
- Launch gradually and monitor errors and abuse before increasing traffic.

## Acceptance criteria

A feature is complete only when its UI, server endpoint, database constraints, authorization, failure states, and tests work together. Mock data and decorative buttons do not count as completed functionality.
