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

/** Progress toward the next tier, for a decorative progress ring — pure
 * derivation from `benefitTier`/`BENEFIT_TIER_THRESHOLDS`, no new metric. At
 * the top tier, `fraction` is 1 (full ring) and `nextThreshold` is null. */
export function benefitTierProgress(
  lifetimePoints: number,
): { tier: number; fraction: number; nextThreshold: number | null } {
  const tier = benefitTier(lifetimePoints);
  const nextThreshold = BENEFIT_TIER_THRESHOLDS[tier] ?? null;
  if (nextThreshold === null) return { tier, fraction: 1, nextThreshold: null };
  const currentThreshold = BENEFIT_TIER_THRESHOLDS[tier - 1]!;
  const span = nextThreshold - currentThreshold;
  const fraction = span <= 0 ? 1 : Math.min(1, Math.max(0, (lifetimePoints - currentThreshold) / span));
  return { tier, fraction, nextThreshold };
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

/**
 * Spend-side counterpart, for recruiters/corporates — who never earn points
 * in this spend-only economy (BUSINESS.md §7/§6a, DESIGN.md §7b, formalized
 * 2026-07-23). Same ALLOWLIST hardening rationale as BENEFIT_EARN_EVENTS:
 * only real spend/purchase-adjacent debits count toward tier eligibility.
 * `partial_refund` is excluded — it's a refund of the recruiter's own past
 * spend, not new participation.
 */
export const BENEFIT_SPEND_EVENTS = ["reveal_spend", "override_spend", "redemption"] as const;

/** Sum of allowlisted spend-events only (absolute value — the ledger stores
 * debits as negative amounts). Same monotonic-historical-sum shape as
 * getLifetimeEarnedPoints: never reduced by a current balance running low. */
export async function getLifetimeSpentPoints(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("points_ledger")
    .select("amount")
    .eq("profile_id", profileId)
    .in("event", BENEFIT_SPEND_EVENTS as unknown as string[]);
  if (error) throw new Error(`lifetime spend lookup failed: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + Math.abs(Math.min(0, row.amount as number)), 0);
}

/** Per-side lifetime metric feeding tier eligibility: seekers on lifetime
 * EARNED, recruiters/corporates (no earn mechanism) on lifetime SPENT — both
 * monotonic historical sums, neither a balance. */
export async function getLifetimeBenefitPoints(
  supabase: SupabaseClient,
  profileId: string,
  role: "seeker" | "recruiter",
): Promise<number> {
  return role === "seeker"
    ? getLifetimeEarnedPoints(supabase, profileId)
    : getLifetimeSpentPoints(supabase, profileId);
}

/**
 * Loyalty ladder rows for the dashboard widget: one row per tier in
 * BENEFIT_TIER_THRESHOLDS, with reached/current status and per-tier unlock
 * counts. Unlock counts are NOT cumulative — each partner counts only at the
 * tier matching its tier_required value, never duplicated across lower tiers.
 */
export function loyaltyLadderRows(
  lifetimePoints: number,
  partners: { tier_required: number }[],
): Array<{ tier: number; threshold: number; reached: boolean; current: boolean; unlockedPartnerCount: number }> {
  const currentTier = benefitTier(lifetimePoints);

  // Build a map: tier -> count of partners requiring exactly that tier
  const unlockedByTier = new Map<number, number>();
  for (const partner of partners) {
    const count = unlockedByTier.get(partner.tier_required) ?? 0;
    unlockedByTier.set(partner.tier_required, count + 1);
  }

  return BENEFIT_TIER_THRESHOLDS.map((threshold, index) => {
    const tier = index + 1;
    return {
      tier,
      threshold,
      reached: lifetimePoints >= threshold,
      current: tier === currentTier,
      unlockedPartnerCount: unlockedByTier.get(tier) ?? 0,
    };
  });
}

/**
 * Query benefit_partners for tier_required only (deliberately excludes
 * code/discount_description — the ladder says WHAT unlocks, never leaks
 * redemption codes). Returns all partners ordered by tier_required.
 */
export async function listBenefitPartnerUnlocks(
  supabase: SupabaseClient,
): Promise<{ tier_required: number }[]> {
  const { data, error } = await supabase
    .from("benefit_partners")
    .select("tier_required")
    .order("tier_required");
  if (error) throw new Error(`benefit partner unlocks lookup failed: ${error.message}`);
  return data ?? [];
}
