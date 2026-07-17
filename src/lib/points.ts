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

export class InsufficientPointsError extends Error {
  constructor(profileId: string, balance: number, needed: number) {
    super(`profile ${profileId} has ${balance} points, needs ${needed}`);
    this.name = "InsufficientPointsError";
  }
}

/** Seed a new profile's starting balance (idempotent per profile). */
export async function seedBalance(
  admin: SupabaseClient,
  profileId: string,
  role: "seeker" | "recruiter" | "enterprise_admin",
): Promise<void> {
  const { data } = await admin
    .from("points_ledger")
    .select("id")
    .eq("profile_id", profileId)
    .eq("event", "seed")
    .maybeSingle();
  if (data) return;
  await appendLedger(admin, {
    profileId,
    event: "seed",
    amount: role === "seeker" ? SEEKER_SEED_POINTS : RECRUITER_SEED_POINTS,
    note: "signup seed",
  });
}
