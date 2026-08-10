import Link from "next/link";
import { CreditLedger, type CreditLedgerEntry } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTrainingCreditBalance, getRecentTrainingLedger } from "@/lib/training";

interface Props {
  balance?: number;
  ledger?: { label: string; note: string; amount: number }[];
  careerPathProgram?: { title: string; module_count: number } | null;
  trainingCompletionCount?: number;
}

/** Training credits dashboard widget (seeker/page): balance + recent ledger
 * activity + optional "Path" goal panel when a career_path-track program is
 * chosen. The goal panel shows honest module-completion progress (0 or 1
 * binary for now, until multi-module tracking exists), never a percentage-
 * match projection (DESIGN.md invariant: no raw score to seeker-facing code).
 * Accepts already-fetched data as props (loadSeekerContext provides all of
 * it today) — self-fetches anything omitted, for standalone/future use. */
export default async function TrainingCreditsCard(props: Props) {
  let { balance, ledger, careerPathProgram, trainingCompletionCount } = props;

  if (balance === undefined || ledger === undefined) {
    const session = await requireRole("seeker");
    const supabase = await createSupabaseServerClient();
    const [fetchedBalance, fetchedLedger] = await Promise.all([
      balance === undefined ? getTrainingCreditBalance(supabase, session.userId) : balance,
      ledger === undefined ? getRecentTrainingLedger(supabase, session.userId, 5) : ledger,
    ]);
    balance = fetchedBalance;
    ledger = fetchedLedger;

    if (careerPathProgram === undefined) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("career_path_program_id")
        .eq("id", session.userId)
        .maybeSingle();

      if (profile?.career_path_program_id) {
        const [{ data: program }, { count: completionCount }] = await Promise.all([
          supabase
            .from("training_programs")
            .select("title, module_count")
            .eq("id", profile.career_path_program_id)
            .maybeSingle(),
          supabase
            .from("training_completions")
            .select("id", { count: "exact" })
            .eq("profile_id", session.userId)
            .eq("program_id", profile.career_path_program_id),
        ]);
        careerPathProgram = program ?? null;
        trainingCompletionCount = completionCount ?? 0;
      } else {
        careerPathProgram = null;
      }
    }
  }

  const entries: CreditLedgerEntry[] = ledger.map((row) => ({
    label: row.label,
    note: row.note,
    amount: row.amount,
  }));

  // Goal panel: only render when a path is chosen.
  let goalTitle: string | undefined;
  let goalMeta: string | undefined;
  let goalPercent: number | undefined;

  if (careerPathProgram) {
    goalTitle = `Path · ${careerPathProgram.title}`;
    // training_completions has unique (profile_id, program_id), so the count
    // is either 0 or 1. Honest binary: X of Y modules, no percentage projection.
    const completedModules = trainingCompletionCount === 1 ? 1 : 0;
    goalMeta = `${completedModules} of ${careerPathProgram.module_count} module${careerPathProgram.module_count === 1 ? "" : "s"}`;
    goalPercent = completedModules > 0 ? 100 : 0;
  }

  return (
    <div className="space-y-3">
      <CreditLedger
        label="Training credits"
        balance={balance}
        balanceNote="personal · earned by completing programs"
        {...(goalTitle ? { goalTitle, goalMeta, goalPercent } : {})}
        entries={entries}
        emptyMessage="No training activity yet."
        footnote="Employer-assigned training never touches your personal credit ledger"
      />
      <Link
        href="/training"
        className="block text-xs text-primary hover:underline"
      >
        View training →
      </Link>
    </div>
  );
}
