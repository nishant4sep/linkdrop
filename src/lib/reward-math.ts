/**
 * Pure reward math and validation. Intentionally dependency-free so it can be
 * tested without the Supabase server client or `server-only`.
 *
 * All amounts are integer points converted to integer CENTS at the boundary to
 * avoid floating-point drift. Numeric money is never compared with ===.
 */

export const RULE_VERSION = "v1";
export const REWARD_POINTS_PER_APPROVAL = 25;
export const MIN_REDEMPTION_POINTS = 100;
export const MAX_REDEMPTION_POINTS = 100_000;

export type RewardEntryLike = {
  /** One of: earn | adjustment | reversal | redeem | refund */
  entry_type: string;
  /** One of: pending | posted | voided */
  status: string;
  amount: number;
};

export type RedemptionStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing"
  | "paid"
  | "rejected"
  | "cancelled";

export type RedemptionLike = {
  amount: number;
  status: string;
};

export type RewardState = {
  /** Points balance usable in a new payout request request (integer points). */
  availablePoints: number;
  /** Pending earn entries, not yet counted as usable. */
  pendingReviewPoints: number;
  /** Requests the owner has paid out. */
  paidOutPoints: number;
  /** Requests currently held by the owner console. */
  outstandingPoints: number;
  born: boolean;
};

export function toCents(points: number): number {
  return Math.round(points * 100);
}

export function toPoints(cents: number): number {
  return cents / 100;
}

function isIntegerPoints(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Aggregates the authoritative reward state from immutable events:
 *   usable = posted(earn,refund,adjustment) - posted(redeem,reversal) - outstanding(redemptions)
 * A redemption row in an in-flight status IS the reservation (the hold), so no
 * ledger row is needed for one. This keeps ledger entries append-only and makes
 * the pay transition balance-neutral:
 *   request: outstanding +A, usable -A
 *   pay:     outstanding -A, posted redeem +A → usable unchanged (already spent)
 *   reject:  outstanding -A, posted redeem unchanged → usable +A (hold released)
 */
export function aggregateRewardState(entries: RewardEntryLike[], redemptions: RedemptionLike[]): RewardState {
  let postedAdd = 0;
  let postedSubtract = 0;
  let pendingAdd = 0;

  for (const entry of entries) {
    const amount = toCents(entry.amount ?? 0);
    if (entry.status === "posted") {
      if (entry.entry_type === "earn" || entry.entry_type === "refund" || entry.entry_type === "adjustment") {
        postedAdd += amount;
      } else if (entry.entry_type === "redeem" || entry.entry_type === "reversal") {
        postedSubtract += amount;
      }
    } else if (entry.status === "pending" && entry.entry_type === "earn") {
      pendingAdd += amount;
    }
  }

  let outstanding = 0;
  let paidOut = 0;
  for (const redemption of redemptions) {
    const amount = toCents(redemption.amount ?? 0);
    if (
      redemption.status === "requested" ||
      redemption.status === "under_review" ||
      redemption.status === "approved" ||
      redemption.status === "processing"
    ) {
      outstanding += amount;
    } else if (redemption.status === "paid") {
      paidOut += amount;
    }
  }

  const availableCents = Math.max(0, postedAdd - postedSubtract - outstanding);

  return {
    availablePoints: availableCents / 100,
    pendingReviewPoints: pendingAdd / 100,
    paidOutPoints: paidOut / 100,
    outstandingPoints: outstanding / 100,
    born: true,
  };
}

/**
 * Validates a payout request amount supplied by a contributor. The rule version
 * and minimums are server-owned; only the amount itself may be provided.
 * Returns either a normalized integer points amount or an error code.
 */
export function validatePayoutRequestAmount(
  input: unknown,
  availablePoints: number
): { ok: true; amount: number } | { ok: false; code: "invalid_amount" | "below_minimum" | "over_maximum" | "insufficient_balance" } {
  if (typeof input !== "number" || !Number.isInteger(input) || input <= 0 || !isIntegerPoints(input)) {
    return { ok: false, code: "invalid_amount" };
  }
  if (input < MIN_REDEMPTION_POINTS) return { ok: false, code: "below_minimum" };
  if (input > MAX_REDEMPTION_POINTS) return { ok: false, code: "over_maximum" };
  // Compare at cent precision: DB amounts carry at most two decimals, so float
  // summation noise (0.1 + 0.2) must never inflate a usable balance.
  const availableCents = Math.round(toCents(availablePoints));
  if (toCents(input) > availableCents) return { ok: false, code: "insufficient_balance" };
  return { ok: true, amount: input };
}

/** Human-readable labels for ledger explanation codes. */
export const EXPLANATION_LABELS: Record<string, string> = {
  LINK_PUBLISHED: "Link approved and published",
  PAYOUT_DELIVERED: "Payout delivered",
  PAYOUT_REJECTED: "Payout request rejected",
  MANUAL_ADJUSTMENT: "Manual adjustment by review team",
  FRAUD_REVERSAL: "Reversed after a review",
};
