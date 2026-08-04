"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { costForSeeker, rewardTrainingCompletion, spendTrainingCredits } from "@/lib/training";

/** Complete a PERSONAL program (career-path or compliance, not enterprise-
 * assigned): spends credits at the seeker's current cost (waived while Pro —
 * costForSeeker), then rewards completion credits + points. Static seeded
 * content this pass (DESIGN.md §7a) — no real lesson flow yet, so "complete"
 * is the one interaction. Idempotent: a completion already on record is a
 * no-op (same check-then-write idiom as points.ts seedBalance). */
export async function completeTrainingProgram(programId: string): Promise<void> {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("training_completions")
    .select("id")
    .eq("profile_id", session.userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (existing) return;

  const { data: program, error: programError } = await supabase
    .from("training_programs")
    .select("id, title, credit_cost")
    .eq("id", programId)
    .single();
  if (programError || !program) throw new Error("program not found");

  const { data: profile } = await supabase
    .from("profiles")
    .select("seeker_tier")
    .eq("id", session.userId)
    .single();
  const tier: "free" | "pro" = profile?.seeker_tier === "pro" ? "pro" : "free";
  const cost = costForSeeker(program.credit_cost, tier);

  await spendTrainingCredits(admin, session.userId, programId, cost);

  const { error: completionError } = await admin
    .from("training_completions")
    .insert({ profile_id: session.userId, program_id: programId });
  if (completionError) {
    if (completionError.code === "23505") {
      revalidatePath("/training");
      return; // raced with another request that completed it first
    }
    throw new Error(`training completion failed: ${completionError.message}`);
  }

  await rewardTrainingCompletion(admin, session.userId, programId, program.title, tier);
  revalidatePath("/training");
}

/** Complete an ENTERPRISE-assigned program: no credits, no points reward —
 * a pure license/assignment model (DESIGN.md §7a). Deliberately does not
 * feed the personal points-earn loop; that's scoped to the free-tier
 * personal flywheel only. Uses the admin client: migration 0010 grants
 * `authenticated` only select/insert on this table (no update policy), so
 * the action itself enforces the profile_id scope — same "service role
 * bypasses RLS; action enforces its own invariant" pattern CLAUDE.md
 * describes for the reveal flow. */
export async function completeAssignedTraining(assignmentId: string): Promise<void> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("enterprise_training_assignments")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("profile_id", session.userId)
    .is("completed_at", null);
  if (error) throw new Error(`assignment completion failed: ${error.message}`);
  revalidatePath("/training");
}
