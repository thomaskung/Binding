"use server";

import { revalidatePath } from "next/cache";
import { getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { refreshMatchesForProfile } from "@/lib/matching";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/** Save draft profile text + dealbreakers without republishing. */
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
    })
    .eq("id", session.userId);
  if (error) throw new Error(`draft save failed: ${error.message}`);
  revalidatePath("/seeker/profile");
}

/** Publish: redact -> embed -> replace live skill vector. One AI round-trip
 * per explicit publish (never per keystroke — Modal credit guardrail). */
export async function publishProfile() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const ai = getAiProvider();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("draft_text")
    .eq("id", session.userId)
    .single();
  if (error || !profile?.draft_text?.trim()) {
    throw new Error("nothing to publish — write your profile first");
  }

  const { redactedText } = await ai.redact(profile.draft_text);
  const embedding = await ai.embed(redactedText);

  const { error: vecError } = await admin.from("skill_vectors").upsert(
    {
      profile_id: session.userId,
      redacted_text: redactedText,
      embedding: JSON.stringify(embedding),
    },
    { onConflict: "profile_id" },
  );
  if (vecError) throw new Error(`vector upsert failed: ${vecError.message}`);

  await supabase
    .from("profiles")
    .update({ published_text: profile.draft_text })
    .eq("id", session.userId);

  // Surface matches against already-active jobs immediately — a candidate
  // joining after a job was published must not stay invisible.
  await refreshMatchesForProfile(admin, session.userId);

  revalidatePath("/seeker/profile");
  revalidatePath("/seeker");
}

/** AI refinement: suggest-and-approve. Returns the suggestion; the client
 * shows a side-by-side diff and the user decides. Free during MVP —
 * points-gating for seekers comes later (see src/lib/points.ts notes). */
export async function refineProfileText(draftText: string): Promise<string> {
  await requireRole("seeker");
  const ai = getAiProvider();
  // Private path only: profile text is candidate-derived (DESIGN.md rule).
  return ai.refineProfile(draftText);
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
