import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateRewardState,
  REWARD_POINTS_PER_APPROVAL,
  MIN_REDEMPTION_POINTS,
  validatePayoutRequestAmount
} from "./reward-math.ts";

// The rule constant must stay wired to the award test below.
assert.equal(REWARD_POINTS_PER_APPROVAL, 25);

const earn = (amount: number) => ({ entry_type: "earn", status: "posted", amount });
const hold = (amount: number) => ({ entry_type: "redeem", status: "posted", amount });
const redemption = (amount: number, status: string) => ({ amount, status });

const IN_FLIGHT = ["requested", "under_review", "approved", "processing"];

test("aggregateRewardState: approval credits are usable immediately", () => {
  const state = aggregateRewardState([earn(25), earn(25)], []);
  assert.equal(state.availablePoints, 50);
});

test("aggregateRewardState: pending earns are visible but not usable", () => {
  const state = aggregateRewardState([earn(25), { entry_type: "earn", status: "pending", amount: 25 }], []);
  assert.equal(state.availablePoints, 25);
  assert.equal(state.pendingReviewPoints, 25);
});

test("aggregateRewardState: in-flight redemption states all hold credit", () => {
  for (const status of IN_FLIGHT) {
    const state = aggregateRewardState([earn(125)], [redemption(100, status)]);
    assert.equal(state.availablePoints, 25, `status=${status}`);
    assert.equal(state.outstandingPoints, 100);
  }
});

test("aggregateRewardState: paying a redemption keeps the balance stable", () => {
  // Before pay: outstanding 100, posted debit 0 → usable 25.
  const before = aggregateRewardState([earn(125)], [redemption(100, "requested")]);
  assert.equal(before.availablePoints, 25);

  // After pay: posted redeem 100 replaces the outstanding hold → still 25.
  const after = aggregateRewardState([earn(125), hold(100)], [redemption(100, "paid")]);
  assert.equal(after.availablePoints, 25);
  assert.equal(after.paidOutPoints, 100);
});

test("aggregateRewardState: rejecting a redemption releases the hold", () => {
  const state = aggregateRewardState([earn(125)], [redemption(100, "rejected")]);
  assert.equal(state.availablePoints, 125);
  assert.equal(state.outstandingPoints, 0);
});

test("aggregateRewardState: posted reversals subtract, refunds add", () => {
  const state = aggregateRewardState(
    [earn(125), { entry_type: "reversal", status: "posted", amount: 25 }, { entry_type: "refund", status: "posted", amount: 10 }],
    []
  );
  assert.equal(state.availablePoints, 110);
});

test("aggregateRewardState: balance never goes negative", () => {
  const state = aggregateRewardState([earn(25)], [redemption(100, "requested")]);
  assert.equal(state.availablePoints, 0);
});

test("validatePayoutRequestAmount: accepts a valid whole-points request", () => {
  const result = validatePayoutRequestAmount(100, 100);
  assert.deepEqual(result, { ok: true, amount: 100 });
});

test("validatePayoutRequestAmount: rejects non-integers, junk, zero", () => {
  for (const bad of [12.5, "100", null, 0, -1, NaN, Infinity]) {
    assert.equal(validatePayoutRequestAmount(bad as never, 1000).ok, false);
  }
});

test("validatePayoutRequestAmount: enforces the server-owned minimum", () => {
  const result = validatePayoutRequestAmount(MIN_REDEMPTION_POINTS - 1, 10_000);
  assert.deepEqual(result, { ok: false, code: "below_minimum" });
});

test("validatePayoutRequestAmount: enforces the maximum", () => {
  const result = validatePayoutRequestAmount(200_000, 1_000_000);
  assert.deepEqual(result, { ok: false, code: "over_maximum" });
});

test("validatePayoutRequestAmount: cannot request more than available", () => {
  const result = validatePayoutRequestAmount(125, 100);
  assert.deepEqual(result, { ok: false, code: "insufficient_balance" });
});

test("validatePayoutRequestAmount: cent precision guard against float noise", () => {
  // available is 99.99 (two decimals, as stored); requesting 100 must not pass.
  const result = validatePayoutRequestAmount(100, 99.99);
  assert.equal(result.ok, false);
});
