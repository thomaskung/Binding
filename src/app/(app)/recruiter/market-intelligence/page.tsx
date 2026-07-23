import { requireRole } from "@/lib/auth";
import { fetchSalaryTrend, fetchSkillDemand } from "@/lib/market-signals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MarketIntelligence } from "./market-intelligence";

/** B2B market-intelligence product (DESIGN.md §2e/§7). Reads exclusively
 * from the k-anonymized security-definer RPCs (market_skill_demand /
 * market_salary_trend) — never a direct table query — so the k-threshold
 * enforced there can't be bypassed from this page. */
export default async function MarketIntelligencePage() {
  await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [skillDemand, salaryTrend] = await Promise.all([
    fetchSkillDemand(supabase),
    fetchSalaryTrend(supabase),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <MarketIntelligence skillDemand={skillDemand} salaryTrend={salaryTrend} />
    </main>
  );
}
