import { requireRole } from "@/lib/auth";
import {
  fetchSalaryTrend,
  fetchSalaryTrendBySeniority,
  fetchSkillDemand,
  fetchSkillDemandByLocation,
} from "@/lib/market-signals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MarketIntelligence } from "./market-intelligence";

/** B2B market-intelligence product (DESIGN.md §2e/§7). Reads exclusively
 * from the k-anonymized security-definer RPCs (market_skill_demand /
 * market_salary_trend and their Phase 3B by-dimension counterparts) — never
 * a direct table query — so the k-threshold enforced there can't be
 * bypassed from this page. */
export default async function MarketIntelligencePage() {
  await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [skillDemand, salaryTrend, skillDemandByLocation, salaryTrendBySeniority] = await Promise.all([
    fetchSkillDemand(supabase),
    fetchSalaryTrend(supabase),
    fetchSkillDemandByLocation(supabase),
    fetchSalaryTrendBySeniority(supabase),
  ]);

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <MarketIntelligence
        skillDemand={skillDemand}
        salaryTrend={salaryTrend}
        skillDemandByLocation={skillDemandByLocation}
        salaryTrendBySeniority={salaryTrendBySeniority}
      />
    </main>
  );
}
