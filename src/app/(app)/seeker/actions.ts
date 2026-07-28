"use server";

import { revalidatePath } from "next/cache";
import { getAiProvider } from "@/lib/ai";
import { AI_REFINE_CHAT_DAILY_CAP, countRefineChatCallsToday, logRefineChatCall } from "@/lib/ai-usage";
import { requireRole } from "@/lib/auth";
import { MAINTENANCE_CONSENT_VERSION, MARKET_SIGNALS_CONSENT_VERSION } from "@/lib/consent";
import { computeExperienceStats, experienceFactsSentence, seniorityBand } from "@/lib/experience";
import { filterFieldsForSurface, type FieldVisibilityMap } from "@/lib/field-visibility";
import { parseCommaList } from "@/lib/jobs";
import { isQuickActionInstruction } from "@/lib/profile";
import { refreshMatchesForProfile } from "@/lib/matching";
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

  const { error } = await supabase
    .from("profiles")
    .update({
      draft_text: draftText,
      dealbreaker_matrix: {
        min_salary: minSalary ? Number(minSalary) : null,
        currency: "USD",
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
      .select("draft_text, skills, desired_roles, industries, references_available, field_visibility")
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

  const { redactedText } = await ai.redact(profile.draft_text);

  // Derived, aggregated facts from structured work history — never the raw
  // entries — blended into what gets embedded so matching benefits from
  // them without a separate scoring formula (see src/lib/experience.ts).
  // Two compositions, not one: `field_visibility` lets a seeker mark a field
  // "matching_only" (hidden from recruiters, still helps matching) or
  // "hidden" (excluded from both) — see src/lib/field-visibility.ts, the
  // single source of truth for which fields support which modes.
  const stats = computeExperienceStats(
    (experience ?? []).map((e) => ({
      startDate: e.start_date,
      endDate: e.end_date,
      industry: e.industry,
    })),
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
  const displayText = displayFacts ? `${redactedText}\n\n${displayFacts}` : redactedText;
  const matchingText = matchingFacts ? `${redactedText}\n\n${matchingFacts}` : redactedText;

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

export async function updateSettings(formData: FormData) {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const visibility = formData.get("visibility") === "paused" ? "paused" : "active";
  const overrideEnabled = formData.get("reveal_override_enabled") === "on";

  const { error: pErr } = await supabase
    .from("profiles")
    .update({ visibility })
    .eq("id", session.userId);
  if (pErr) throw new Error(pErr.message);

  const { error: cErr } = await supabase
    .from("consent_flags")
    .upsert({ profile_id: session.userId, reveal_override_enabled: overrideEnabled });
  if (cErr) throw new Error(cErr.message);

  revalidatePath("/seeker/profile");
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

/** Candidate responds to a pending override reveal. Identity was already
 * disclosed at purchase; this gates messaging only. Decline refunds the
 * recruiter's 15-pt premium (they keep paying the 10-pt base for the look). */
export async function respondToOverride(revealId: string, response: "accepted" | "declined") {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data: reveal, error } = await admin
    .from("reveal_requests")
    .select("id, path, status, profile_id, recruiter_id, created_at, refunded")
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
      amount: OVERRIDE_PREMIUM_REFUND,
      revealRequestId: reveal.id,
      note: "override declined by candidate",
    });
  }

  revalidatePath("/seeker");
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
  const { error } = await supabase
    .from("matches")
    .update({ status: response })
    .eq("id", matchId)
    .eq("profile_id", session.userId)
    .eq("status", "surfaced");
  if (error) throw new Error(`match response failed: ${error.message}`);
  revalidatePath("/seeker");
}
