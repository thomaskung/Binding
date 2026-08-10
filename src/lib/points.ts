import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Points economy constants — PLACEHOLDER ECONOMICS, documented as such
 * (BUSINESS.md §7 pricing work pending real data).
 *
 * Deferred (tables/enums exist, logic doesn't):
 *  - point purchases (recruiter top-ups)
 *  - override path spend + partial refunds
 *  - verified-action earning rules
 *  - redemptions — NOTE: the AI-Credit Marketplace redemption is a HARD legal
 *    blocker until SG/HK counsel signs off on the licensing-exemption question.
 *    See LEGAL_REVIEW.md before wiring any redemption beyond AI rewriting.
 */
export const SEEKER_SEED_POINTS = 10;
export const RECRUITER_SEED_POINTS = 100;
export const REVEAL_COST = 10;
export const REVEAL_COMPENSATION = 3;
// Standard-reveal daily cap (DESIGN.md §5 rate-limited-reveals mitigation —
// previously only overrides were capped, so "rate-limited reveals" was
// half-true). 10/day binds at the affordable burst under seed economics
// (100 pts / 10 per reveal); it becomes fully load-bearing once top-ups
// ship. Checked BEFORE the balance check for deterministic error ordering.
export const REVEAL_DAILY_CAP = Number(process.env.REVEAL_DAILY_CAP ?? 10);

// Override path (paid pre-opt-in reveal — DESIGN.md §4):
// 25 total = 10 base (the look, kept on decline) + 15 engagement premium
// (refunded if the candidate declines or the override expires).
export const OVERRIDE_COST = 25;
export const OVERRIDE_PREMIUM_REFUND = 15;
export const OVERRIDE_COMPENSATION = 5; // higher than standard — bigger privacy cost
export const OVERRIDE_DAILY_CAP = Number(process.env.OVERRIDE_DAILY_CAP ?? 5);
export const OVERRIDE_REBLOCK_DAYS = Number(process.env.OVERRIDE_REBLOCK_DAYS ?? 30);
export const OVERRIDE_EXPIRY_DAYS = Number(process.env.OVERRIDE_EXPIRY_DAYS ?? 7);

// Match-quality reveal pricing (DESIGN.md §4a — a first cut of the dynamic
// pricing roadmap, founder directive 2026-08-04): a stronger match costs more
// to reveal. Multiplier tiers on the raw cosine score; placeholder like every
// other constant here, env-tunable-in-spirit, sized once real usage exists.
// Charged AND displayed through revealCostForScore so the card can never show
// a price different from what's spent.
export function matchPriceMultiplier(score: number): number {
  if (score >= 0.8) return 2; // top matches — premium
  if (score >= 0.65) return 1.5; // strong
  return 1; // baseline
}
export function revealCostForScore(baseCost: number, score: number): number {
  return Math.round(baseCost * matchPriceMultiplier(score));
}

// Same-role reveal discount: a 40% discount (0.6 multiplier) applies when
// revealing a candidate who matches the same role as a previous reveal for
// the same job (rank 2+). Rank 1 (first reveal) always pays full price.
export const SAME_ROLE_DISCOUNT_MULTIPLIER = 0.6;

/** Reveal cost with match-quality multiplier and optional same-role discount.
 * Applies match-tier pricing first (round), then same-role discount if rank > 1.
 * The two-step approach preserves the override invariant: cost = keptBase + refund
 * when both are computed from this function with the same rank and score. */
export function revealCostForRank(
  baseCost: number,
  score: number,
  revealRankForJob: number,
): number {
  const multiplied = Math.round(baseCost * matchPriceMultiplier(score));
  if (revealRankForJob > 1) {
    return Math.round(multiplied * SAME_ROLE_DISCOUNT_MULTIPLIER);
  }
  return multiplied;
}

export async function getBalance(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("points_balances")
    .select("balance")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(`balance lookup failed: ${error.message}`);
  return data?.balance ?? 0;
}

/** Append a ledger event. Positive amount credits, negative debits.
 * Enforces non-negative resulting balance for debits. Server-side only
 * (ledger writes go through the admin client). */
export async function appendLedger(
  admin: SupabaseClient,
  entry: {
    profileId: string;
    event:
      | "seed"
      | "reveal_spend"
      | "reveal_compensation"
      | "override_spend"
      | "partial_refund"
      | "verified_action"
      | "redemption";
    amount: number;
    revealRequestId?: string;
    note?: string;
  },
): Promise<void> {
  if (entry.amount < 0) {
    const balance = await getBalance(admin, entry.profileId);
    if (balance + entry.amount < 0) {
      throw new InsufficientPointsError(entry.profileId, balance, -entry.amount);
    }
  }
  const { error } = await admin.from("points_ledger").insert({
    profile_id: entry.profileId,
    event: entry.event,
    amount: entry.amount,
    reveal_request_id: entry.revealRequestId ?? null,
    note: entry.note ?? null,
  });
  if (error) throw new Error(`ledger append failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Freshness-confirmation earning (BUSINESS.md §3/§6a, DESIGN.md §2c — added
// 2026-07-23): a genuine suggest-and-approve maintenance update earns points,
// rate-limited so the maintenance nudge can't be farmed by repeatedly
// re-triggering it. Deliberately not "AI-verified" like a skill assessment —
// a self-reported update isn't independently verifiable; the cooldown plus
// the requirement that it's a real suggest-and-approve event (never a raw
// field edit) is what preserves the anti-farming intent.
// ---------------------------------------------------------------------------
export const FRESHNESS_CONFIRMATION_POINTS = 3;
export const FRESHNESS_CONFIRMATION_COOLDOWN_DAYS = Number(
  process.env.FRESHNESS_CONFIRMATION_COOLDOWN_DAYS ?? 90,
);
const FRESHNESS_CONFIRMATION_NOTE = "freshness confirmation";

/** Earn freshness-confirmation points if outside the cooldown window since
 * the last one. Returns true if points were earned, false if still cooling
 * down (silent no-op — callers don't need to surface this to the user). */
export async function earnFreshnessConfirmation(
  admin: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const since = new Date(
    Date.now() - FRESHNESS_CONFIRMATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from("points_ledger")
    .select("id")
    .eq("profile_id", profileId)
    .eq("event", "verified_action")
    .eq("note", FRESHNESS_CONFIRMATION_NOTE)
    .gte("created_at", since)
    .limit(1);
  if (error) throw new Error(`freshness confirmation check failed: ${error.message}`);
  if ((data ?? []).length > 0) return false;

  await appendLedger(admin, {
    profileId,
    event: "verified_action",
    amount: FRESHNESS_CONFIRMATION_POINTS,
    note: FRESHNESS_CONFIRMATION_NOTE,
  });
  return true;
}

export class InsufficientPointsError extends Error {
  constructor(profileId: string, balance: number, needed: number) {
    super(`profile ${profileId} has ${balance} points, needs ${needed}`);
    this.name = "InsufficientPointsError";
  }
}

/** Seed a role-activation balance (idempotent per profile+role — dual-role
 * accounts get each role's seed once, on activation). */
export async function seedBalance(
  admin: SupabaseClient,
  profileId: string,
  role: "seeker" | "recruiter",
): Promise<void> {
  const note = `${role} activation seed`;
  const { data } = await admin
    .from("points_ledger")
    .select("id")
    .eq("profile_id", profileId)
    .eq("event", "seed")
    .eq("note", note)
    .maybeSingle();
  if (data) return;
  await appendLedger(admin, {
    profileId,
    event: "seed",
    amount: role === "seeker" ? SEEKER_SEED_POINTS : RECRUITER_SEED_POINTS,
    note,
  });
}

// ---------------------------------------------------------------------------
// Override guards (DESIGN.md §4 guardrails)
// ---------------------------------------------------------------------------

/** Pure guard for a reveal-shaped spend: cap first, then balance — the
 * ordering is part of the contract (a capped recruiter must see the cap
 * error even when also broke, so the message doesn't flap with balance).
 * Returns the error message to throw, or null if the spend may proceed. */
export function revealSpendGuard(input: {
  usedToday: number;
  dailyCap: number;
  balance: number;
  cost: number;
  kind: "reveal" | "override";
}): string | null {
  if (input.usedToday >= input.dailyCap) {
    return `daily ${input.kind} limit reached (${input.dailyCap}/day)`;
  }
  if (input.balance < input.cost) {
    return input.kind === "override"
      ? `insufficient points (${input.balance}/${input.cost}) — point top-ups are coming soon`
      : `insufficient points (${input.balance}/${input.cost})`;
  }
  return null;
}

/** Standard reveals used by this recruiter in the last 24h (daily cap). */
export async function countStandardRevealsToday(
  admin: SupabaseClient,
  recruiterId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("points_ledger")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", recruiterId)
    .eq("event", "reveal_spend")
    .gte("created_at", since);
  if (error) throw new Error(`reveal count failed: ${error.message}`);
  return count ?? 0;
}

/** Overrides used by this recruiter in the last 24h (daily cap check). */
export async function countOverridesToday(
  admin: SupabaseClient,
  recruiterId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("points_ledger")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", recruiterId)
    .eq("event", "override_spend")
    .gte("created_at", since);
  if (error) throw new Error(`override count failed: ${error.message}`);
  return count ?? 0;
}

/** Count reveals (standard path) already created for a specific job by a recruiter.
 * Used to assign same-role reveal ranks (rank 1 = first reveal, rank 2+ = discounted). */
export async function countRevealsForJob(
  admin: SupabaseClient,
  recruiterId: string,
  jobPostingId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("reveal_requests")
    .select("id", { count: "exact", head: true })
    .eq("recruiter_id", recruiterId)
    .eq("job_posting_id", jobPostingId);
  if (error) throw new Error(`reveal count for job failed: ${error.message}`);
  return count ?? 0;
}

/** 30-day re-override block: true if this recruiter has a declined/expired
 * override against this candidate inside the window (any job). */
export async function isOverrideBlocked(
  admin: SupabaseClient,
  recruiterId: string,
  profileId: string,
): Promise<boolean> {
  const since = new Date(
    Date.now() - OVERRIDE_REBLOCK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from("reveal_requests")
    .select("id")
    .eq("recruiter_id", recruiterId)
    .eq("profile_id", profileId)
    .eq("path", "override")
    .eq("status", "declined")
    .gte("responded_at", since)
    .limit(1);
  if (error) throw new Error(`override block check failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export interface StaleCheckReveal {
  id: string;
  path: "standard" | "override";
  status: "pending" | "accepted" | "declined";
  recruiter_id: string;
  created_at: string;
  refunded: boolean;
  premium_refund?: number | null; // scaled refund locked at charge time (§4a); null → flat fallback
}

/** Lazy 7-day expiry: a pending override past the window becomes a decline —
 * premium refunded, messaging never opens, 30-day block applies. Called from
 * both sides' read/action paths instead of a cron. Returns true if expired. */
export async function expireStaleOverride(
  admin: SupabaseClient,
  reveal: StaleCheckReveal,
): Promise<boolean> {
  if (reveal.path !== "override" || reveal.status !== "pending") return false;
  const ageMs = Date.now() - new Date(reveal.created_at).getTime();
  if (ageMs < OVERRIDE_EXPIRY_DAYS * 24 * 60 * 60 * 1000) return false;

  const { error } = await admin
    .from("reveal_requests")
    .update({ status: "declined", refunded: true, responded_at: new Date().toISOString() })
    .eq("id", reveal.id)
    .eq("status", "pending"); // guard against concurrent responses
  if (error) throw new Error(`override expiry failed: ${error.message}`);

  if (!reveal.refunded) {
    await appendLedger(admin, {
      profileId: reveal.recruiter_id,
      event: "partial_refund",
      amount: reveal.premium_refund ?? OVERRIDE_PREMIUM_REFUND,
      revealRequestId: reveal.id,
      note: "override expired (7 days unanswered)",
    });
  }
  return true;
}

/** Pure function: sort candidates by score (descending) and annotate with
 * reveal rank for same-role discount eligibility. Rank 1 = first reveal
 * (full price), rank 2+ = subsequent reveals (discounted). Unit-testable
 * without any database access.
 *
 * @param candidates Array of candidates with a numeric score field
 * @param startingRank Rank to assign to the highest-scoring candidate (typically 1)
 * @returns Candidates sorted by score descending, each with added rank field
 */
export function assignRevealRanks<T extends { score: number }>(
  candidates: T[],
  startingRank: number,
): Array<T & { rank: number }> {
  return candidates
    .sort((a, b) => b.score - a.score)
    .map((candidate, index) => ({
      ...candidate,
      rank: startingRank + index,
    }));
}
