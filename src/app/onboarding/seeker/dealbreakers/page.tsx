import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DealbreakersForm } from "./dealbreakers-form";

/** Onboarding step 3, its OWN route (not a client-side step in the resume
 * wizard): after the resume wizard persists, it router.pushes here. A real
 * navigation keeps the dealbreakers step on the router (immune to the RSC
 * refresh after server actions, which wiped the wizard's client step state on
 * Vercel — override E2E, 2026-08-14). Reads the saved draft + dealbreakers
 * from the DB so Back/Finish round-trip through persisted data. */
export default async function SeekerDealbreakersPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("draft_text, dealbreaker_matrix")
    .eq("id", session.userId)
    .single();

  const matrix = (profile?.dealbreaker_matrix ?? {}) as {
    min_salary?: number | null;
    work_setups?: string[];
    equity_required?: boolean;
  };

  return (
    <DealbreakersForm
      draftText={profile?.draft_text ?? ""}
      minSalary={matrix.min_salary ?? null}
      workSetups={matrix.work_setups ?? []}
      equityRequired={matrix.equity_required ?? false}
    />
  );
}
