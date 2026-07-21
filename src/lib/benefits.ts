import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Benefits/loyalty tier (DESIGN.md §7b, reframed 2026-07-21 —
 * LEGAL_REVIEW.md Q8: no stored value, no payment nexus). Tier is a
 * READ-ONLY signal derived from LIFETIME points earned — reaching or
 * keeping a tier never debits points_ledger. Placeholder thresholds, same
 * "placeholder economics" posture as src/lib/points.ts.
 */
export const BENEFIT_TIER_THRESHOLDS = [0, 50, 150] as const;

/**
 * ALLOWLIST, not a denylist, of points_ledger events that count toward
 * Benefits eligibility. This is the hardening the design depends on: a
 * future event type (e.g. a seeker points purchase, should one ever ship)
 * does NOT inflate tier eligibility unless someone deliberately adds it
 * here — purchased points must never buy Benefits access (that would
 * quietly reintroduce the cash-nexus last session's reframe closed).
 * `partial_refund` is deliberately excluded — it returns someone else's
 * spend, it isn't new participation. `seed` is also excluded — it's an
 * activation freebie, not participation, and the founder explicitly
 * rejected rewarding inactivity when choosing points over account tenure
 * as the tier signal.
 */
export const BENEFIT_EARN_EVENTS = ["reveal_compensation", "verified_action"] as const;

/** Highest tier whose threshold the given lifetime-earned total clears. */
export function benefitTier(lifetimeEarnedPoints: number): number {
  let tier = 1;
  for (let i = 0; i < BENEFIT_TIER_THRESHOLDS.length; i++) {
    if (lifetimeEarnedPoints >= BENEFIT_TIER_THRESHOLDS[i]!) tier = i + 1;
  }
  return tier;
}

/** Sum of allowlisted earn-events only — never a spend, never a purchase. */
export async function getLifetimeEarnedPoints(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("points_ledger")
    .select("amount")
    .eq("profile_id", profileId)
    .in("event", BENEFIT_EARN_EVENTS as unknown as string[]);
  if (error) throw new Error(`lifetime points lookup failed: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + Math.max(0, row.amount as number), 0);
}
