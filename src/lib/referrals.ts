import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Referral / invite acquisition loop (DESIGN.md §13g). Invite-code
 * generation + lookup live here (pure/unit-testable pieces); the earn
 * mechanic (`earnReferralActivation`) lives in `src/lib/points.ts` alongside
 * every other points economics rule, and the capture wiring lives in
 * `src/app/onboarding/actions.ts` (see `captureAndEarnReferral` there for
 * why activation — not raw signup — is the capture point).
 */

/** Cookie carrying an invite code from `/invite/[code]` through to
 * whichever role the new account first activates. No query param (founder's
 * path-segment-only routing rule) — this is the substitute. httpOnly, short
 * lived, single-use (deleted the moment onboarding activation reads it). */
export const REFERRAL_COOKIE_NAME = "referral_code";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Short, URL-safe invite code: 6 random bytes (48 bits) base36-encoded
 * (~9-10 chars). Not trying to be cryptographically unguessable — this is a
 * points-only, never-monetary mechanic (DESIGN.md closed-loop invariant) — just
 * short enough to paste into a link and collision-safe under the retry loop
 * in `getOrCreateInviteCode`. */
export function generateInviteCode(): string {
  return BigInt(`0x${randomBytes(6).toString("hex")}`).toString(36);
}

/** Read profiles.invite_code, generating + persisting one on first read if
 * absent (lazy generation — most profiles never look at /invite, so most
 * profiles never get a code). Retries on a unique-violation or a lost race
 * against a concurrent generator; at 48 bits of entropy this is a belt-and-
 * suspenders guarantee, not a load-bearing one. */
export async function getOrCreateInviteCode(
  admin: SupabaseClient,
  profileId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("invite_code")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(`invite code lookup failed: ${error.message}`);
  if (data?.invite_code) return data.invite_code;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const code = generateInviteCode();
    // `.is("invite_code", null)` guards against clobbering a code a
    // concurrent request already set for this same profile.
    const { error: updateError } = await admin
      .from("profiles")
      .update({ invite_code: code })
      .eq("id", profileId)
      .is("invite_code", null);
    if (updateError && updateError.code !== "23505") {
      throw new Error(`invite code generation failed: ${updateError.message}`);
    }
    const { data: confirmed, error: confirmError } = await admin
      .from("profiles")
      .select("invite_code")
      .eq("id", profileId)
      .maybeSingle();
    if (confirmError) throw new Error(`invite code confirm failed: ${confirmError.message}`);
    if (confirmed?.invite_code) return confirmed.invite_code;
    // Neither this attempt's code nor a concurrent one stuck — retry.
  }
  throw new Error(`invite code generation failed for profile ${profileId} after 5 attempts`);
}

/** Resolve the referrer profile id for a given invite code, or null if the
 * code doesn't exist. Takes an admin client — this is looked up
 * unauthenticated (the redeem-landing route handler runs signed out) and
 * must bypass RLS's owner-only select policy on `profiles`. */
export async function resolveReferrerByCode(
  admin: SupabaseClient,
  code: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("invite_code", code)
    .maybeSingle();
  if (error) throw new Error(`referrer lookup failed: ${error.message}`);
  return data?.id ?? null;
}
