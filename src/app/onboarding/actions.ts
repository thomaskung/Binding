"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { CONSENT_VERSION } from "@/lib/consent";
import { seedBalance } from "@/lib/points";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Activate the seeker role: display name + ToS + explicit AI-processing
 * consent (PDPA/PDPO — DESIGN.md §5). Seeds +10 pts once. */
export async function activateSeeker(formData: FormData) {
  const { user } = await requireUser();
  const admin = createSupabaseAdminClient();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const tos = formData.get("tos") === "on";
  const processing = formData.get("processing_consent") === "on";
  if (!displayName) throw new Error("display name required");
  if (!tos || !processing) {
    throw new Error("both the terms and the AI-processing consent are required to continue");
  }

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
    consent_version: CONSENT_VERSION,
  });
  await seedBalance(admin, user.id, "seeker");

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

  redirect("/recruiter");
}
