/** Recruiter subscription tiers (BUSINESS.md §7). Free is the default; the
 * paid tiers (Solo / Advanced / Pro SaaS) are named strategy concepts with no
 * billing integration yet — the column is set via seed data or the dev-only
 * toggle until a real payment flow lands. */
export type RecruiterTier = "free" | "solo" | "advanced" | "pro_saas";

const RECRUITER_TIER_VALUES: readonly RecruiterTier[] = [
  "free",
  "solo",
  "advanced",
  "pro_saas",
];

/** Coerce a raw DB value into a valid RecruiterTier, defaulting to "free". */
export function coerceRecruiterTier(value: string | null | undefined): RecruiterTier {
  return RECRUITER_TIER_VALUES.includes(value as RecruiterTier) ? (value as RecruiterTier) : "free";
}

const RECRUITER_TIER_LABEL: Record<RecruiterTier, string> = {
  free: "Free",
  solo: "Solo",
  advanced: "Advanced",
  pro_saas: "Pro SaaS",
};

export function recruiterTierLabel(tier: RecruiterTier): string {
  return RECRUITER_TIER_LABEL[tier];
}

/** Market Intelligence full-access gate: only "advanced" and "pro_saas" tiers
 * unlock the deep-dive reports and compensation breakdowns. Solo is
 * deliberately excluded (one regression for this high-value feature). */
export function hasMarketIntelFullAccess(tier: RecruiterTier): boolean {
  return tier === "advanced" || tier === "pro_saas";
}
