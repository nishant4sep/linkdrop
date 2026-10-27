# LinkDrop P3 — Reward ledger invariants

## Do not enable redeemable rewards until these rules are implemented

The current schema design combines an append-only reward ledger with states such as `pending`, `posted`, and `voided`. If ledger rows cannot be updated, the application must not try to transition one row from pending to posted. If rows can be updated, the append-only guarantee is not actually enforced. Resolve this mismatch before enabling points with monetary value.

## Recommended model

Use immutable ledger entries and represent every transition with a new entry. A minimal conceptual model is:

- `pending_credit`: records a provisional reward.
- `posted_credit`: records an earned reward only after the required approval checks pass.
- `reversal`: offsets a previously posted credit after fraud, a moderation reversal, or a valid dispute.
- `redemption_debit`: reserves or consumes an earned balance when redemption is processed.
- `redemption_release`: reverses a reservation when redemption fails or is cancelled.

Every entry should include a UUID, contributor ID, positive amount, currency/points unit, event type, source submission ID when applicable, idempotency key, rule version, actor ID where appropriate, creation time, and a link to the entry it compensates. The event type determines whether the amount adds to or subtracts from the computed balance. Never edit a balance column directly from the browser.

## Atomicity and idempotency

1. The same approved submission must not earn twice if an admin retries, a worker retries, or a network response is lost.
2. Add a unique constraint on the canonical reward event identity, such as `(event_type, source_submission_id, rule_version)`, adapted to the final schema.
3. Perform approval, reward posting, and the event/idempotency insert in one database transaction or use a durable outbox with idempotent consumers.
4. Redemption must atomically reserve no more than the available balance. A read-then-write balance check in application code is race-prone.
5. Reversals must reference the original event and be unique for that reversal reason/event identity.
6. Store the reward rule version on every reward event so historical calculations remain explainable after policy changes.
7. Keep an auditable reason and actor for manual adjustments. Do not delete ledger history to correct mistakes.

## Safe rollout sequence

1. Launch with points disabled or non-redeemable.
2. Implement and review the final immutable-event schema and transaction functions.
3. Test duplicate approval, concurrent approval, worker retries, rejection, appeal reversal, redemption races, failed redemption, and admin disablement.
4. Reconcile computed ledger balances against an independent test fixture.
5. Enable points behind a server-side feature flag.
6. Introduce cash or redeemable value only after legal, tax, fraud, and payment-provider review.

## Acceptance criteria

- Replaying an approval request does not duplicate reward credit.
- Two concurrent redemption requests cannot overspend the balance.
- A reversal preserves the original event and creates a traceable compensating event.
- All balance changes have a source event and an idempotency key.
- Client roles cannot insert, update, or delete reward entries directly.
- The server never accepts an amount or reward rule supplied by a contributor as authoritative.

This document describes the required invariants; it is not a migration and does not claim these controls are implemented by the current schema.
