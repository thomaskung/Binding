"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { seedBalance } from "@/lib/points";

export async function chooseRole(formData: FormData) {
  const role = formData.get("role");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (role !== "seeker" && role !== "recruiter") {
    throw new Error("invalid role");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    role,
    display_name: displayName || user.email?.split("@")[0] || "Member",
  });
  if (error && error.code !== "23505") {
    // 23505 = already onboarded; fall through to redirect
    throw new Error(`profile creation failed: ${error.message}`);
  }

  const admin = createSupabaseAdminClient();
  await admin.from("consent_flags").upsert({ profile_id: user.id });
  await seedBalance(admin, user.id, role);

  redirect(role === "seeker" ? "/seeker" : "/recruiter");
}
