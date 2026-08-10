import { requireRole } from "@/lib/auth";
import { getTrainingCreditBalance } from "@/lib/training";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingHome } from "./training-home";

/** Training / reskilling home (DESIGN.md §7a). Career-path + compliance
 * tracks side by side, personal credit balance, Pro-waived cost, and any
 * enterprise-assigned programs shown separately from the personal catalog. */
export default async function TrainingPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: programs }, { data: profile }, { data: completions }, { data: assignments }, balance] =
    await Promise.all([
      supabase
        .from("training_programs")
        .select("id, track, type, title, description, module_count, credit_cost")
        .order("track")
        .order("credit_cost"),
      supabase.from("profiles").select("seeker_tier, career_path_program_id").eq("id", session.userId).single(),
      supabase.from("training_completions").select("program_id").eq("profile_id", session.userId),
      supabase
        .from("enterprise_training_assignments")
        .select("id, program_id, assigned_at, completed_at, training_programs(title, description, module_count)")
        .eq("profile_id", session.userId),
      getTrainingCreditBalance(supabase, session.userId),
    ]);

  const completedProgramIds = new Set((completions ?? []).map((c) => c.program_id));

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <TrainingHome
        seekerTier={profile?.seeker_tier === "pro" ? "pro" : "free"}
        creditBalance={balance}
        currentCareerPathId={profile?.career_path_program_id}
        programs={(programs ?? []).map((p) => ({
          id: p.id,
          track: p.track as "career_path" | "compliance",
          type: p.type as "guided" | "ai_quiz",
          title: p.title,
          description: p.description,
          moduleCount: p.module_count,
          creditCost: p.credit_cost,
          completed: completedProgramIds.has(p.id),
        }))}
        assignments={(assignments ?? []).map((a) => {
          const program = Array.isArray(a.training_programs) ? a.training_programs[0] : a.training_programs;
          return {
            id: a.id,
            title: program?.title ?? "Assigned program",
            description: program?.description ?? "",
            moduleCount: program?.module_count ?? 1,
            completed: a.completed_at != null,
          };
        })}
      />
    </main>
  );
}
