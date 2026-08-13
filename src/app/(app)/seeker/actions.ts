"use server";

import { revalidatePath } from "next/cache";
import { getAiProvider } from "@/lib/ai";
import { AI_REFINE_CHAT_DAILY_CAP, countRefineChatCallsToday, logRefineChatCall } from "@/lib/ai-usage";
import { requireRole } from "@/lib/auth";
import {
  CONNECTED_ACCOUNTS_CONSENT_VERSION,
  MAINTENANCE_CONSENT_VERSION,
  MARKET_SIGNALS_CONSENT_VERSION,
} from "@/lib/consent";
import { dsarExportGuard, DSAR_EXPORT_COOLDOWN_DAYS } from "@/lib/dsar";
import {
  computeExperienceStats,
  experienceFactsSentence,
  normalizeExperienceDates,
  seniorityBand,
} from "@/lib/experience";
import { fieldMode, filterFieldsForSurface, type FieldVisibilityMap } from "@/lib/field-visibility";
import { redactKnownIdentifiers } from "@/lib/redact-known";
import { parseCommaList } from "@/lib/jobs";
import { isQuickActionInstruction } from "@/lib/profile";
import { matchBand, refreshMatchesForProfile, type SeekerTier } from "@/lib/matching";
import {
  appendLedger,
  earnFreshnessConfirmation,
  expireStaleOverride,
  OVERRIDE_PREMIUM_REFUND,
} from "@/lib/points";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/** Save draft profile text + dealbreakers + identity/preference fields
 * without republishing (no AI round-trip — that only happens on publish). */
export async function saveDraft(formData: FormData) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const draftText = String(formData.get("draft_text") ?? "");
  const minSalary = formData.get("min_salary");
  const workSetups = formData.getAll("work_setups").map(String);
  const equityRequired = formData.get("equity_required") === "on";

  const { error } = await supabase
    .from("profiles")
    .update({
      draft_text: draftText,
      dealbreaker_matrix: {
        min_salary: minSalary ? Number(minSalary) : null,
        currency: "USD",
        equity_required: equityRequired,
        work_setups: workSetups,
      },
      headline: String(formData.get("headline") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      skills: parseCommaList(String(formData.get("skills") ?? "")),
      desired_roles: parseCommaList(String(formData.get("desired_roles") ?? "")),
      industries: parseCommaList(String(formData.get("industries") ?? "")),
      references_available: formData.get("references_available") === "on",
      share_salary: formData.get("share_salary") === "on",
      credentials: String(formData.get("credentials") ?? "").trim() || null,
    })
    .eq("id", session.userId);
  if (error) throw new Error(`draft save failed: ${error.message}`);
  revalidatePath("/seeker/profile");
}

/** Narrow draft-text-only save for the resume canvas — saveDraft() above is
 * a whole-form replace (missing FormData fields wipe columns), which the
 * canvas must never trigger since it edits only the draft. */
export async function saveDraftText(draftText: string) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ draft_text: draftText })
    .eq("id", session.userId);
  if (error) throw new Error(`draft save failed: ${error.message}`);
  revalidatePath("/seeker/profile");
}

export interface ExperienceRowInput {
  role: string;
  company: string;
  industry: string | null;
  startDate: string;
  endDate: string | null;
}

/** Replace-all save for the work-history list — same "edit the whole form,
 * save" pattern as the rest of this page. Structured entries stay
 * owner-only (RLS); only aggregated facts derived from them ever reach the
 * match embedding (see publishProfile). */
export async function saveExperience(rows: ExperienceRowInput[]) {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { error: deleteError } = await admin
    .from("seeker_experience")
    .delete()
    .eq("profile_id", session.userId);
  if (deleteError) throw new Error(deleteError.message);

  const validRows = rows.filter((r) => r.role.trim() && r.company.trim() && r.startDate);
  if (validRows.length > 0) {
    const { error: insertError } = await admin.from("seeker_experience").insert(
      validRows.map((r) => ({
        profile_id: session.userId,
        role: r.role.trim(),
        company: r.company.trim(),
        industry: r.industry?.trim() || null,
        start_date: r.startDate,
        end_date: r.endDate || null,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }
  await admin
    .from("profiles")
    .update({ last_profile_activity_at: new Date().toISOString() })
    .eq("id", session.userId);
  revalidatePath("/seeker/profile");
}

/** Publish: redact -> embed -> replace live skill vector. One AI round-trip
 * per explicit publish (never per keystroke — Modal credit guardrail). */
export async function publishProfile() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const ai = getAiProvider();

  const [{ data: profile, error }, { data: experience }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, draft_text, skills, desired_roles, industries, references_available, field_visibility, credentials",
      )
      .eq("id", session.userId)
      .single(),
    supabase
      .from("seeker_experience")
      .select("role, company, industry, start_date, end_date")
      .eq("profile_id", session.userId),
  ]);
  if (error || !profile?.draft_text?.trim()) {
    throw new Error("nothing to publish — write your profile first");
  }

  // Hybrid redaction (G1): the LLM pass generalizes, then a deterministic pass
  // strips the identifiers we already hold structured (real name + employer
  // names) so recruiter-visible text can't leak them even when the small model
  // under-redacts. See src/lib/redact-known.ts.
  const llmRedacted = await ai.redact(profile.draft_text);
  const { text: redactedText } = redactKnownIdentifiers(llmRedacted.redactedText, {
    names: profile.display_name ? [profile.display_name] : [],
    organizations: (experience ?? []).map((e) => e.company).filter((c): c is string => !!c),
  });

  // Derived, aggregated facts from structured work history — never the raw
  // entries — blended into what gets embedded so matching benefits from
  // them without a separate scoring formula (see src/lib/experience.ts).
  // Two compositions, not one: `field_visibility` lets a seeker mark a field
  // "matching_only" (hidden from recruiters, still helps matching) or
  // "hidden" (excluded from both) — see src/lib/field-visibility.ts, the
  // single source of truth for which fields support which modes.
  const stats = computeExperienceStats(
    normalizeExperienceDates(
      (experience ?? []).map((e) => ({
        startDate: e.start_date,
        endDate: e.end_date,
        industry: e.industry,
      })),
    ),
  );
  const fieldVisibility = (profile.field_visibility ?? {}) as FieldVisibilityMap;
  const rawFields = {
    skills: profile.skills ?? [],
    desiredRoles: profile.desired_roles ?? [],
    industries: profile.industries ?? [],
    referencesAvailable: profile.references_available ?? false,
  };
  const displayFacts = experienceFactsSentence(
    stats,
    filterFieldsForSurface(rawFields, fieldVisibility, "display"),
  );
  const matchingFacts = experienceFactsSentence(
    stats,
    filterFieldsForSurface(rawFields, fieldVisibility, "matching"),
  );
  // Credentials: generalize free-text -> de-identified summary (recruiter card
  // chip via match_candidates RPC). Folded into the MATCH embedding so strong
  // credentials nudge ranking ("bonus points"), but NOT into displayText/
  // redacted_text (the card renders credentials_summary as its own chip).
  // If the seeker hid credentials, it feeds neither display nor matching.
  const credentialsHidden = fieldMode(profile.field_visibility as FieldVisibilityMap, "credentials") === "hidden";
  const credentialsSummary = credentialsHidden
    ? ""
    : await ai.generalizeCredentials(profile.credentials ?? "");

  const displayText = displayFacts ? `${redactedText}\n\n${displayFacts}` : redactedText;
  const matchingText = [redactedText, matchingFacts, credentialsSummary]
    .filter((s) => s && s.trim())
    .join("\n\n");

  const embedding = await ai.embed(matchingText);

  // redacted_text is what recruiters and the fit-summary generator see
  // (recruiter/actions.ts revealCandidate/overrideRevealCandidate, the
  // match_candidates RPC, match-list.tsx) — must be the DISPLAY text, never
  // the matching text, or a "matching_only" field would leak into view.
  const { error: vecError } = await admin.from("skill_vectors").upsert(
    {
      profile_id: session.userId,
      redacted_text: displayText,
      embedding: JSON.stringify(embedding),
    },
    { onConflict: "profile_id" },
  );
  if (vecError) throw new Error(`vector upsert failed: ${vecError.message}`);

  // Stored, not derived in SQL — the market-intel seniority-band breakdown
  // (supabase/migrations/0015_market_signals_by_dimension.sql) needs one
  // scalar per profile, computed from the same canonical interval-merge
  // total used everywhere else, not a second SQL-side approximation.
  await supabase
    .from("profiles")
    .update({
      published_text: profile.draft_text,
      last_profile_activity_at: new Date().toISOString(),
      seniority_band: seniorityBand(stats.totalYears),
      years_experience: Math.round(stats.totalYears),
      credentials_summary: credentialsSummary || null,
    })
    .eq("id", session.userId);

  // Surface matches against already-active jobs immediately — a candidate
  // joining after a job was published must not stay invisible.
  await refreshMatchesForProfile(admin, session.userId);

  revalidatePath("/seeker/profile");
  revalidatePath("/seeker");
}

/** AI refinement: suggest-and-approve. Returns the suggestion; the client
 * shows a side-by-side diff and the user decides. Free during MVP —
 * points-gating for seekers comes later (see src/lib/points.ts notes).
 *
 * `instruction` is either one of PROFILE_QUICK_ACTIONS (available to every
 * seeker) or a free-text/chat instruction — Pro tier ONLY, enforced here
 * server-side (never trust the client to have hidden the chat input) and
 * rate-limited (src/lib/ai-usage.ts) since it's the open-ended-cost surface
 * on the Modal path. */
export async function refineProfileText(draftText: string, instruction?: string): Promise<string> {
  const session = await requireRole("seeker");
  const ai = getAiProvider();

  if (instruction && !isQuickActionInstruction(instruction)) {
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("seeker_tier")
      .eq("id", session.userId)
      .single();
    if (profile?.seeker_tier !== "pro") {
      throw new Error("free-text AI refinement is a Pro feature");
    }
    const usedToday = await countRefineChatCallsToday(admin, session.userId);
    if (usedToday >= AI_REFINE_CHAT_DAILY_CAP) {
      throw new Error("daily AI refinement limit reached — try again tomorrow");
    }
    await logRefineChatCall(admin, session.userId);
  }

  // Private path only: profile text is candidate-derived (DESIGN.md rule).
  return ai.refineProfile(draftText, instruction);
}

/** Resume-first onboarding's suggest-and-approve step (DESIGN.md §2c):
 * structure skills/roles/industries/work-history out of the raw resume text
 * for the wizard to render as approve/edit/remove cards. Private path only —
 * raw resume text, pre-redaction. Never applied automatically; the caller
 * decides what to keep. */
export async function extractOnboardingFields(resumeText: string) {
  await requireRole("seeker");
  const ai = getAiProvider();
  return ai.extractProfileFields(resumeText);
}

/** Consent gate for the continuous-maintenance loop (DESIGN.md §2c,
 * LEGAL_REVIEW.md Q14): maintenance consent is OPTIONAL at onboarding and
 * withdrawable, so both halves of the loop must refuse to run without it —
 * the nudge surface shows a just-in-time consent prompt instead. */
async function requireMaintenanceConsent(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("consent_flags")
    .select("maintenance_consent_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!data?.maintenance_consent_at) {
    throw new Error("continuous AI maintenance requires your consent — enable it to continue");
  }
}

/** Maintenance nudge (DESIGN.md §2c continuous-maintenance loop), draft
 * half: turns the seeker's free-text answer to "anything new?" into a
 * suggested addition. Suggest-and-approve — returns the suggestion only,
 * never writes anything (see acceptMaintenanceUpdate for the write path). */
export async function requestMaintenanceDraft(userAnswer: string): Promise<string> {
  const session = await requireRole("seeker");
  await requireMaintenanceConsent(session.userId);
  const supabase = await createSupabaseServerClient();
  const ai = getAiProvider();

  const { data: profile } = await supabase
    .from("profiles")
    .select("draft_text, published_text")
    .eq("id", session.userId)
    .single();
  const currentSummary = profile?.published_text ?? profile?.draft_text ?? "";
  return ai.draftMaintenanceUpdate(currentSummary, userAnswer);
}

/** Maintenance nudge, approve half: appends the approved addition to the
 * profile draft and republishes (redact -> embed -> match, same one-AI-pass-
 * per-publish discipline as the regular publish flow) — this is also what
 * refreshes last_profile_activity_at, clearing the dashboard's stale state.
 * Also earns freshness-confirmation points (BUSINESS.md §3/§6a, rate-limited
 * — see src/lib/points.ts), a silent no-op if still within the cooldown. */
export async function acceptMaintenanceUpdate(addition: string): Promise<void> {
  const session = await requireRole("seeker");
  await requireMaintenanceConsent(session.userId);
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("draft_text")
    .eq("id", session.userId)
    .single();
  const nextDraft = [profile?.draft_text?.trim(), addition.trim()].filter(Boolean).join("\n\n");

  const { error } = await supabase
    .from("profiles")
    .update({ draft_text: nextDraft })
    .eq("id", session.userId);
  if (error) throw new Error(`maintenance update save failed: ${error.message}`);

  await publishProfile();
  await earnFreshnessConfirmation(admin, session.userId);
}

/** Saves the per-field visibility map (src/lib/field-visibility.ts). Takes
 * effect on the next Publish, same as any other draft field — this never
 * triggers its own AI round-trip (one-AI-pass-per-explicit-publish holds
 * here too). */
export async function updateFieldVisibility(map: FieldVisibilityMap) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({ field_visibility: map })
    .eq("id", session.userId);
  if (error) throw new Error(`field visibility save failed: ${error.message}`);
  revalidatePath("/seeker/profile");
}

/** "Pause profile" toggle (DESIGN.md §14j) — reuses the ALREADY-EXISTING
 * `profiles.visibility` enum (migration 0001; 'active'/'paused') rather than
 * adding a new column. Paused: no new matches surface (match_candidates /
 * match_jobs_for_candidate both filter on `visibility = 'active'`) and no new
 * reveal can target this profile — a softer, temporary option than full
 * account deletion. */
export async function updateProfileVisibility(paused: boolean) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({ visibility: paused ? "paused" : "active" })
    .eq("id", session.userId);
  if (error) throw new Error(`profile visibility update failed: ${error.message}`);

  revalidatePath("/seeker/settings/privacy");
  revalidatePath("/seeker/profile");
}

/** Reveal-override opt-in toggle. Split out of the old combined
 * updateSettings() (DESIGN.md §13e/§14j: the settings page renders this as
 * one of the consent-center's two un-versioned toggle rows — reveal_override_
 * enabled has no version column, unlike the 4 entries in CONSENT_REGISTRY,
 * so it's rendered explicitly rather than folded into the registry's shape). */
export async function updateOverrideEnabled(enabled: boolean) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("consent_flags")
    .upsert({ profile_id: session.userId, reveal_override_enabled: enabled });
  if (error) throw new Error(`reveal-override update failed: ${error.message}`);

  revalidatePath("/seeker/settings/privacy");
}

/** `consent_flags.contact_sharing_consent` (migration 0001) has existed since
 * the very first schema but had no reader/writer anywhere in the app until
 * now — same un-versioned-toggle treatment as reveal_override_enabled above,
 * per the settings-page consent-center gap the founder flagged explicitly. */
export async function updateContactSharingConsent(enabled: boolean) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("consent_flags")
    .upsert({ profile_id: session.userId, contact_sharing_consent: enabled });
  if (error) throw new Error(`contact-sharing consent update failed: ${error.message}`);

  revalidatePath("/seeker/settings/privacy");
}

/** Notification preferences (migration 0028) — transactional (new matches,
 * reveal activity) kept separate from the marketing-style toggle, so opting
 * out of product updates can never silence match/reveal notifications
 * (DESIGN.md §14j). No delivery mechanism exists yet anywhere in this
 * codebase; these columns are the preference store a future notifier would
 * read, not a claim that anything is emailed today. */
const NOTIFICATION_PREFERENCE_COLUMNS = {
  notifyNewMatches: "notify_new_matches",
  notifyRevealActivity: "notify_reveal_activity",
  notifyProductUpdates: "notify_product_updates",
} as const;
export type NotificationPreferenceKey = keyof typeof NOTIFICATION_PREFERENCE_COLUMNS;

/** Updates exactly ONE notification-preference column. Deliberately not a
 * "send all three" call taking the other two from closure-captured client
 * state — three independent toggles sharing one write shape means two quick
 * clicks (toggle A, then B before A's response lands) can have B's request
 * silently revert A's change back to its stale captured value. Single-field
 * writes make that class of bug structurally impossible rather than
 * incidentally prevented by today's shared useTransition serializing clicks. */
export async function updateNotificationPreference(
  key: NotificationPreferenceKey,
  value: boolean,
) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const column = NOTIFICATION_PREFERENCE_COLUMNS[key];
  const { error } = await supabase
    .from("profiles")
    .update({ [column]: value })
    .eq("id", session.userId);
  if (error) throw new Error(`notification preference update failed: ${error.message}`);

  revalidatePath("/seeker/settings/privacy");
}

/** "Delete my original resume now" (DESIGN.md §14j) — a REAL delete of the
 * seeker's own resume row(s) + Storage object(s), distinct from full account
 * deletion. Explicitly NOT crypto-shredding (that's a later phase per the
 * founder's brief) — this removes the row and the stored file outright, same
 * mechanics as the resume-deletion step of account deletion
 * (src/app/(app)/account/actions.ts), just scoped to resumes only. */
export async function deleteOriginalResume() {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data: resumes, error: fetchError } = await admin
    .from("resumes")
    .select("id, storage_path")
    .eq("profile_id", session.userId);
  if (fetchError) throw new Error(`resume lookup failed: ${fetchError.message}`);

  const paths = (resumes ?? []).map((r) => r.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error: storageError } = await admin.storage.from("resumes").remove(paths);
    if (storageError) throw new Error(`resume file delete failed: ${storageError.message}`);
  }

  const { error: deleteError } = await admin
    .from("resumes")
    .delete()
    .eq("profile_id", session.userId);
  if (deleteError) throw new Error(`resume row delete failed: ${deleteError.message}`);

  revalidatePath("/seeker/settings/privacy");
  revalidatePath("/seeker/profile/resume");
}

/** Self-service data export (DSAR, DESIGN.md §14j) — rate-limited via
 * src/lib/dsar.ts's pure guard, checked BEFORE anything else runs (same
 * cap-first discipline as revealSpendGuard). Returns a JSON string of the
 * seeker's own profile/resume/match data for the client to download as a
 * file; deliberately minimal — no async job queue, no email delivery, just a
 * synchronous read of the caller's own rows via the admin client (some of
 * this data — raw_text, consent_flags — has no authenticated-client RLS
 * policy at all, so the admin client is required here regardless).
 *
 * Includes `resumes.raw_text` directly — §14j says an export containing the
 * ORIGINAL résumé should trigger the §2g live-passkey decrypt ceremony, which
 * doesn't exist yet (no encryption-at-rest/passkey infra is built this
 * phase). This is judged safe without it: raw_text is already owner-only data
 * the seeker can read any time via their own résumé page
 * (/seeker/profile/resume), so exporting it to themselves discloses nothing
 * new — the decrypt ceremony's purpose is authorizing a THIRD PARTY's access,
 * not gating a user's access to their own data. Revisit this call when §2g's
 * encryption/passkey work actually lands. */
export async function exportMyData(): Promise<string> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("dsar_last_exported_at")
    .eq("id", session.userId)
    .single();

  const guardError = dsarExportGuard({
    lastExportedAt: profile?.dsar_last_exported_at ? new Date(profile.dsar_last_exported_at) : null,
    now: new Date(),
    cooldownDays: DSAR_EXPORT_COOLDOWN_DAYS,
  });
  if (guardError) throw new Error(guardError);

  const [{ data: fullProfile }, { data: resumes }, { data: matches }, { data: consent }, { data: ledger }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", session.userId).single(),
      admin.from("resumes").select("id, raw_text, storage_path, created_at").eq("profile_id", session.userId),
      admin.from("matches").select("id, job_posting_id, status, score, created_at").eq("profile_id", session.userId),
      admin.from("consent_flags").select("*").eq("profile_id", session.userId).maybeSingle(),
      admin.from("points_ledger").select("event, amount, note, created_at").eq("profile_id", session.userId),
    ]);

  const { error: stampError } = await admin
    .from("profiles")
    .update({ dsar_last_exported_at: new Date().toISOString() })
    .eq("id", session.userId);
  if (stampError) throw new Error(`dsar export timestamp update failed: ${stampError.message}`);

  revalidatePath("/seeker/settings/privacy");

  // Raw cosine `score` never reaches seeker-facing code (CLAUDE.md invariant,
  // tests/reveal-invariants.test.ts) — that holds for a self-export too, so
  // each match is downgraded to the same qualitative band the seeker already
  // sees in the product, never the underlying number.
  const tier: SeekerTier = fullProfile?.seeker_tier === "pro" ? "pro" : "free";
  const bandedMatches = (matches ?? []).map(({ score, ...rest }) => ({
    ...rest,
    band: matchBand(score, tier),
  }));

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      profile: fullProfile,
      resumes: resumes ?? [],
      matches: bandedMatches,
      consent: consent ?? null,
      pointsLedger: ledger ?? [],
    },
    null,
    2,
  );
}

/** Aggregate market-signals opt-in (DESIGN.md §2e) — a SEPARATE, independently
 * revocable consent from AI-processing consent (src/lib/consent.ts). Toggling
 * off clears the timestamp entirely (not just a boolean flip) so the
 * market_skill_demand/market_salary_trend RPCs' "opted-in" filter drops this
 * profile immediately. */
export async function updateMarketSignalsConsent(optIn: boolean) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("consent_flags").upsert({
    profile_id: session.userId,
    market_signals_opt_in_at: optIn ? new Date().toISOString() : null,
    market_signals_consent_version: optIn ? MARKET_SIGNALS_CONSENT_VERSION : null,
  });
  if (error) throw new Error(`market-signals consent update failed: ${error.message}`);
  revalidatePath("/seeker/profile");
}

/** Continuous-maintenance consent toggle (DESIGN.md §2c, LEGAL_REVIEW.md
 * Q14) — same shape as updateMarketSignalsConsent: independently revocable,
 * clearing the timestamp entirely on withdrawal so the maintenance loop's
 * gate drops immediately. Also the JIT enable path from the nudge surface. */
export async function updateMaintenanceConsent(optIn: boolean) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("consent_flags").upsert({
    profile_id: session.userId,
    maintenance_consent_at: optIn ? new Date().toISOString() : null,
    maintenance_consent_version: optIn ? MAINTENANCE_CONSENT_VERSION : null,
  });
  if (error) throw new Error(`maintenance consent update failed: ${error.message}`);
  revalidatePath("/seeker/profile");
  revalidatePath("/seeker/nudge");
}

/** Connected-accounts (Google Drive) import consent (DESIGN.md §14a, Phase
 * 4) — same shape as updateMarketSignalsConsent/updateMaintenanceConsent:
 * independently revocable, clearing the timestamp entirely on withdrawal.
 * This only toggles CONSENT — it does not itself start the OAuth flow
 * (that's /api/connected-accounts/google-drive/authorize, which checks this
 * flag) and withdrawing it does not revoke an already-granted Google token;
 * disconnecting the account is a fast-follow, not built this phase. */
export async function updateConnectedAccountsConsent(optIn: boolean) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("consent_flags").upsert({
    profile_id: session.userId,
    connected_accounts_opt_in_at: optIn ? new Date().toISOString() : null,
    connected_accounts_consent_version: optIn ? CONNECTED_ACCOUNTS_CONSENT_VERSION : null,
  });
  if (error) throw new Error(`connected-accounts consent update failed: ${error.message}`);

  if (!optIn) {
    // "Revocable any time" (the toggle's own copy) means actually
    // disconnecting, not leaving a live token sitting unused — delete the
    // connected_accounts row (admin client: that table has no authenticated
    // RLS policy, migration 0026) so a re-connect requires going through
    // OAuth again, the same as a first-time connection. This is also what
    // stops /api/connected-accounts/google-drive/{files,import} from
    // continuing to serve real Drive data after consent is withdrawn.
    const admin = createSupabaseAdminClient();
    await admin
      .from("connected_accounts")
      .delete()
      .eq("profile_id", session.userId)
      .eq("provider", "google_drive");
  }

  revalidatePath("/seeker/profile");
  revalidatePath("/seeker/profile/resume");
}

/** Candidate responds to a pending override reveal. Identity was already
 * disclosed at purchase; this gates messaging only. Decline refunds the
 * recruiter's 15-pt premium (they keep paying the 10-pt base for the look). */
export async function respondToOverride(revealId: string, response: "accepted" | "declined") {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data: reveal, error } = await admin
    .from("reveal_requests")
    .select("id, path, status, profile_id, recruiter_id, created_at, refunded, premium_refund")
    .eq("id", revealId)
    .single();
  if (error || reveal.profile_id !== session.userId) throw new Error("reveal not found");
  if (reveal.path !== "override" || reveal.status !== "pending") {
    throw new Error("nothing to respond to");
  }

  // Lazy expiry: too late to respond if the 7-day window passed.
  if (await expireStaleOverride(admin, reveal)) {
    revalidatePath("/seeker");
    throw new Error("this reveal already expired");
  }

  const { error: updateError } = await admin
    .from("reveal_requests")
    .update({
      status: response,
      responded_at: new Date().toISOString(),
      ...(response === "declined" ? { refunded: true } : {}),
    })
    .eq("id", revealId)
    .eq("status", "pending");
  if (updateError) throw new Error(`response failed: ${updateError.message}`);

  if (response === "declined") {
    await appendLedger(admin, {
      profileId: reveal.recruiter_id,
      event: "partial_refund",
      amount: reveal.premium_refund ?? OVERRIDE_PREMIUM_REFUND,
      revealRequestId: reveal.id,
      note: "override declined by candidate",
    });
  }

  revalidatePath("/seeker");
}

/** Set the seeker's chosen career-path training program (for the dashboard
 * training-credits widget goal panel). Validates that the program exists and
 * is track === 'career_path', then updates profiles.career_path_program_id. */
export async function setCareerPath(programId: string): Promise<void> {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const { data: program, error } = await supabase
    .from("training_programs")
    .select("id, track")
    .eq("id", programId)
    .single();
  if (error || !program) throw new Error("program not found");
  if (program.track !== "career_path") throw new Error("only career-path programs can be chosen");

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ career_path_program_id: programId })
    .eq("id", session.userId);
  if (updateError) throw new Error(`career path update failed: ${updateError.message}`);

  revalidatePath("/seeker");
  revalidatePath("/training");
}

/** Dev-only: flip seeker_tier for demoing the Pro match-band gate — no
 * billing integration exists yet (DESIGN.md/BUSINESS.md "Pro seeker
 * $9.99/mo" is a named strategy concept, not a built payment flow). Refuses
 * outside dev so this never ships as a real, unpaid upgrade path. */
export async function toggleSeekerTier() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev-only action");
  }
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("seeker_tier")
    .eq("id", session.userId)
    .single();
  if (error) throw new Error(error.message);

  const nextTier = profile.seeker_tier === "pro" ? "free" : "pro";
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ seeker_tier: nextTier })
    .eq("id", session.userId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/seeker");
}

/** Candidate expresses interest in (or declines) a surfaced match. */
export async function respondToMatch(matchId: string, response: "interested" | "declined") {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  // Stamp a durable declared-interest time (updated_at is clobbered by later
  // status changes) so the recruiter list can sort by "most recent interest".
  const { error } = await supabase
    .from("matches")
    .update({
      status: response,
      interested_at: response === "interested" ? new Date().toISOString() : null,
    })
    .eq("id", matchId)
    .eq("profile_id", session.userId)
    .eq("status", "surfaced");
  if (error) throw new Error(`match response failed: ${error.message}`);
  revalidatePath("/seeker");
}
