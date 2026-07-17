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

// Override path (paid pre-opt-in reveal — DESIGN.md §4):
// 25 total = 10 base (the look, kept on decline) + 15 engagement premium
// (refunded if the candidate declines or the override expires).
export const OVERRIDE_COST = 25;
export const OVERRIDE_PREMIUM_REFUND = 15;
export const OVERRIDE_COMPENSATION = 5; // higher than standard — bigger privacy cost
export const OVERRIDE_DAILY_CAP = Number(process.env.OVERRIDE_DAILY_CAP ?? 5);
export const OVERRIDE_REBLOCK_DAYS = Number(process.env.OVERRIDE_REBLOCK_DAYS ?? 30);
export const OVERRIDE_EXPIRY_DAYS = Number(process.env.OVERRIDE_EXPIRY_DAYS ?? 7);

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
      amount: OVERRIDE_PREMIUM_REFUND,
      revealRequestId: reveal.id,
      note: "override expired (7 days unanswered)",
    });
  }
  return true;
}
