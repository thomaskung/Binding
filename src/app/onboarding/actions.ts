"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONSENT_VERSION,
  MAINTENANCE_CONSENT_VERSION,
  validateSeekerConsent,
} from "@/lib/consent";
import { earnReferralActivation, seedBalance } from "@/lib/points";
import { REFERRAL_COOKIE_NAME } from "@/lib/referrals";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * Referral capture + activation-earn (DESIGN.md §13g). Called from
 * activateSeeker/activateRecruiter ONLY when this is the account's FIRST
 * role activation ever (callers check that before calling this) — an
 * account that has held a role for months and only now opts into a SECOND
 * role must never be treated as a fresh "invitee activation"; that would
 * let anyone farm the loop by adding a role after clicking a friend's link.
 *
 * Runs at activation rather than at raw signup/`/auth/callback` because
 * that's the one server-side moment BOTH real signups (magic-link/OAuth,
 * which land on `/auth/callback`) and this repo's own e2e suite (which
 * creates accounts via the admin API and signs in with a password,
 * `e2e/staging-helpers.ts` `ensureStagingUser`/`signIn` — never touching
 * `/auth/callback` at all) actually converge on.
 *
 * Never allowed to fail the activation it's called from: a bug in the
 * referral loop must not block a brand-new user's onboarding, so every
 * failure is caught and logged rather than thrown.
 */
async function captureAndEarnReferral(admin: SupabaseClient, userId: string) {
  try {
    const cookieStore = await cookies();
    const code = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
    // Always clear once read, regardless of outcome below — a code is
    // single-use per browser, so a later signup in the same browser must
    // never get attributed to a stale click (invalid code, self-referral,
    // and already-captured all fall through to the same "do nothing else"
    // path, but the cookie is gone either way).
    if (code) cookieStore.delete(REFERRAL_COOKIE_NAME);
    if (!code) return;

    const { data: referrer } = await admin
      .from("profiles")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();
    if (!referrer || referrer.id === userId) return; // unknown code or self-referral

    const { data: referral, error } = await admin
      .from("referrals")
      .insert({ referrer_id: referrer.id, referee_id: userId, invite_code: code, status: "signed_up" })
      .select("id")
      .single();
    if (error || !referral) return; // e.g. the referee-unique index already has a row

    await earnReferralActivation(admin, referral.id, referrer.id, userId);
  } catch (e) {
    console.error("referral capture/earn failed (non-fatal)", e);
  }
}

/** Activate the seeker role: display name + ToS + the two REQUIRED consents
 * (AI processing/redaction + automated profiling for matching — they are
 * the service) plus the OPTIONAL continuous-maintenance consent
 * (PDPA/PDPO — DESIGN.md §5/§2c, LEGAL_REVIEW.md Q14). Seeds +10 pts once. */
export async function activateSeeker(formData: FormData) {
  const { user } = await requireUser();
  const admin = createSupabaseAdminClient();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const consentError = validateSeekerConsent({
    tos: formData.get("tos") === "on",
    processing: formData.get("processing_consent") === "on",
    profiling: formData.get("profiling_consent") === "on",
  });
  const maintenance = formData.get("maintenance_consent") === "on";
  if (!displayName) throw new Error("display name required");
  if (consentError) throw new Error(consentError);

  // Referral capture (below) must only fire on a genuinely first-ever role
  // activation for this account — read the pre-upsert state before it's
  // overwritten.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("is_seeker, is_recruiter")
    .eq("id", user.id)
    .maybeSingle();
  const isFirstActivation =
    !existingProfile || (!existingProfile.is_seeker && !existingProfile.is_recruiter);

  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      is_seeker: true,
      display_name: displayName,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`seeker activation failed: ${error.message}`);

  const now = new Date().toISOString();
  await admin.from("consent_flags").upsert({
    profile_id: user.id,
    tos_accepted_at: now,
    processing_consent_at: now,
    profiling_consent_at: now,
    consent_version: CONSENT_VERSION,
    maintenance_consent_at: maintenance ? now : null,
    maintenance_consent_version: maintenance ? MAINTENANCE_CONSENT_VERSION : null,
  });
  await seedBalance(admin, user.id, "seeker");
  // Must stay AFTER the profiles upsert above: referrals.referee_id has a FK
  // to profiles(id), so the referee's own profile row has to exist first.
  if (isFirstActivation) {
    await captureAndEarnReferral(admin, user.id);
  }

  redirect("/onboarding/seeker/profile");
}

/** Activate the recruiter role: display name + company/agency + ToS.
 * Seeds +100 pts once. */
export async function activateRecruiter(formData: FormData) {
  const { user } = await requireUser();
  const admin = createSupabaseAdminClient();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const tos = formData.get("tos") === "on";
  if (!displayName) throw new Error("display name required");
  if (!companyName) throw new Error("company or agency name required");
  if (!tos) throw new Error("the terms must be accepted to continue");

  // Server-side business-email gate (client-side check in signup-form is UX
  // only — this is the enforcement layer). Reject consumer email domains.
  const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com",
    "hotmail.com", "outlook.com", "live.com", "msn.com",
    "aol.com", "aim.com", "icloud.com", "me.com", "mac.com",
    "proton.me", "protonmail.com", "mail.com", "inbox.com",
    "gmx.com", "gmx.de", "yandex.com",
  ]);
  const domain = user.email?.split("@")[1]?.toLowerCase();
  if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
    throw new Error("Please use a business email address for recruiter accounts.");
  }

  // Referral capture (below) must only fire on a genuinely first-ever role
  // activation for this account — read the pre-upsert state before it's
  // overwritten.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("is_seeker, is_recruiter")
    .eq("id", user.id)
    .maybeSingle();
  const isFirstActivation =
    !existingProfile || (!existingProfile.is_seeker && !existingProfile.is_recruiter);

  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      is_recruiter: true,
      display_name: displayName,
      company_name: companyName,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`recruiter activation failed: ${error.message}`);

  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("consent_flags")
    .select("tos_accepted_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  await admin.from("consent_flags").upsert({
    profile_id: user.id,
    tos_accepted_at: existing?.tos_accepted_at ?? now,
    consent_version: CONSENT_VERSION,
  });
  await seedBalance(admin, user.id, "recruiter");
  // Must stay AFTER the profiles upsert above: referrals.referee_id has a FK
  // to profiles(id), so the referee's own profile row has to exist first.
  if (isFirstActivation) {
    await captureAndEarnReferral(admin, user.id);
  }

  redirect("/onboarding/recruiter/profile");
}
