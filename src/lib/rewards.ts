import 'server-only';

import { db } from './server';
import {
  aggregateRewardState,
  MAX_REDEMPTION_POINTS,
  MIN_REDEMPTION_POINTS,
  REWARD_POINTS_PER_APPROVAL,
  RULE_VERSION,
  validatePayoutRequestAmount,
  type RewardState
} from './reward-math';

export * from './reward-math';

export type LedgerRow = {
  id: string;
  entry_type: string;
  status: string;
  unit: string;
  amount: string | number;
  explanation_code: string;
  rule_version: string;
  created_at: string;
};

export type RedemptionRow = {
  id: string;
  contributor_id: string;
  amount: string | number;
  unit: string;
  status: string;
  payout_reference: string | null;
  decision_reason: string | null;
  requested_at: string;
  decided_at: string | null;
};

export type FullRewardState = RewardState & {
  ruleVersion: string;
  rewardPerApproval: number;
  minRedemptionPoints: number;
  maxRedemptionPoints: number;
  redemptionsEnabled: boolean;
};

/**
 * Server-side feature flag: cash payouts are switched OFF by default since the
 * 2026-10-27 pivot (anonymous directory + loyalty model). Set
 * REDEMPTIONS_ENABLED=1 to reopen the contributor payout flow; the full
 * ledger/reservation machinery remains live underneath it.
 */
export function redemptionsEnabled(): boolean {
  const value = (process.env['REDEMPTIONS_ENABLED'] ?? '0').trim().toLowerCase();
  return value !== '0' && value !== 'false';
}

export async function loadRewardEntries(contributorId: string): Promise<LedgerRow[]> {
  const { data, error } = await db()
    .from('reward_ledger')
    .select('id, entry_type, status, unit, amount, explanation_code, rule_version, created_at')
    .eq('contributor_id', contributorId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`reward_ledger lookup failed: ${error.code}`);
  return (data ?? []) as LedgerRow[];
}

export async function loadRedemptions(contributorId: string): Promise<RedemptionRow[]> {
  const { data, error } = await db()
    .from('reward_redemptions')
    .select('id, contributor_id, amount, unit, status, payout_reference, decision_reason, requested_at, decided_at')
    .eq('contributor_id', contributorId)
    .order('requested_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`reward_redemptions lookup failed: ${error.code}`);
  return (data ?? []) as RedemptionRow[];
}

type RewardEntryInput = { entry_type: string; status: string; amount: string | number | null };
type RedemptionInput = { amount: string | number | null; status: string };

export function rewardStateFor(
  entries: RewardEntryInput[],
  redemptions: RedemptionInput[]
): FullRewardState {
  const state = aggregateRewardState(
    entries.map((entry) => ({ entry_type: String(entry.entry_type), status: String(entry.status), amount: Number(entry.amount ?? 0) })),
    redemptions.map((row) => ({ amount: Number(row.amount ?? 0), status: String(row.status) }))
  );
  return {
    ...state,
    ruleVersion: RULE_VERSION,
    rewardPerApproval: REWARD_POINTS_PER_APPROVAL,
    minRedemptionPoints: MIN_REDEMPTION_POINTS,
    maxRedemptionPoints: MAX_REDEMPTION_POINTS,
    redemptionsEnabled: redemptionsEnabled(),
  };
}

export type PayoutRequestDecision =
  | { ok: true; amount: number }
  | { ok: false; message: string };

/**
 * Validates a payout request body against the authoritative balance and the
 * server-owned rules. The DB RPC re-validates atomically; this pre-check keeps
 * error messages precise.
 */
export function decidePayoutRequest(
  rawAmount: unknown,
  entries: RewardEntryInput[],
  redemptions: RedemptionInput[]
): PayoutRequestDecision {
  const state = rewardStateFor(entries, redemptions);
  const decision = validatePayoutRequestAmount(rawAmount, state.availablePoints);
  if (decision.ok) return { ok: true, amount: decision.amount };

  switch (decision.code) {
    case 'below_minimum':
      return { ok: false, message: `The minimum payout request is ${MIN_REDEMPTION_POINTS} points.` };
    case 'over_maximum':
      return { ok: false, message: `A single payout request cannot exceed ${MAX_REDEMPTION_POINTS} points.` };
    case 'insufficient_balance':
      return { ok: false, message: 'That amount is more than your available balance.' };
    default:
      return { ok: false, message: 'Enter a whole number of points.' };
  }
}
