import type { SupabaseClient } from "@supabase/supabase-js";
import { appendLedger } from "./points";

/**
 * Training-credits economics (DESIGN.md §7a) — placeholder amounts, matching
 * the reviewed Training Home mockup's own demo numbers (migration 0010 seed
 * data). One free-tier ledger; Pro subscribers get programs free/waived at
 * start-time (a subscription check, not a bigger allowance — see
 * costForSeeker) and revert to the normal cost the moment the subscription
 * lapses (already-completed programs are unaffected either way). Enterprise
 * assignments never touch credits at all (enterprise_training_assignments).
 *
 * Bootstrap gap, deliberately unresolved (plan / DESIGN.md §11): free users
 * earn credits by completing programs but need credits to start one in the
 * first place. Keep this gating a thin, swappable check (spendTrainingCredits
 * below) rather than hardwiring debit logic into multiple call sites, so the
 * mechanism can change later without a rewrite.
 */

export const TRAINING_COMPLETION_CREDIT_REWARD = 10;
export const TRAINING_COMPLETION_POINTS_REWARD = 5;

export async function getTrainingCreditBalance(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("training_credit_balances")
    .select("balance")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(`training credit balance lookup failed: ${error.message}`);
  return data?.balance ?? 0;
}

/** Cost to START this program for this seeker right now. */
export function costForSeeker(creditCost: number, seekerTier: "free" | "pro"): number {
  return seekerTier === "pro" ? 0 : creditCost;
}

export class InsufficientTrainingCreditsError extends Error {
  constructor(profileId: string, balance: number, needed: number) {
    super(`profile ${profileId} has ${balance} training credits, needs ${needed}`);
    this.name = "InsufficientTrainingCreditsError";
  }
}

async function appendTrainingLedger(
  admin: SupabaseClient,
  entry: { profileId: string; event: "earned" | "spent"; amount: number; programId?: string; note?: string },
): Promise<void> {
  if (entry.amount < 0) {
    const balance = await getTrainingCreditBalance(admin, entry.profileId);
    if (balance + entry.amount < 0) {
      throw new InsufficientTrainingCreditsError(entry.profileId, balance, -entry.amount);
    }
  }
  const { error } = await admin.from("training_credits_ledger").insert({
    profile_id: entry.profileId,
    event: entry.event,
    amount: entry.amount,
    program_id: entry.programId ?? null,
    note: entry.note ?? null,
  });
  if (error) throw new Error(`training ledger append failed: ${error.message}`);
}

/** Start a program: debit credits (free tier only — Pro pays 0, a no-op
 * ledger write, via costForSeeker upstream). */
export async function spendTrainingCredits(
  admin: SupabaseClient,
  profileId: string,
  programId: string,
  cost: number,
): Promise<void> {
  if (cost <= 0) return;
  await appendTrainingLedger(admin, {
    profileId,
    event: "spent",
    amount: -cost,
    programId,
    note: "program started",
  });
}

/** Complete a program: earn training credits AND feed Benefits' points-earn
 * event — the "train more -> get benefits" loop the founder described.
 * Callers must insert the training_completions row first (its unique
 * constraint is what makes re-completion a no-op) and only call this on the
 * first, actual completion. */
export async function rewardTrainingCompletion(
  admin: SupabaseClient,
  profileId: string,
  programId: string,
  programTitle: string,
): Promise<void> {
  await appendTrainingLedger(admin, {
    profileId,
    event: "earned",
    amount: TRAINING_COMPLETION_CREDIT_REWARD,
    programId,
    note: `completed: ${programTitle}`,
  });
  await appendLedger(admin, {
    profileId,
    event: "verified_action",
    amount: TRAINING_COMPLETION_POINTS_REWARD,
    note: `training completion: ${programTitle}`,
  });
}
