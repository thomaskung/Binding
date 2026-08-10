import { requireRole } from "@/lib/auth";
import {
  fetchSalaryTrend,
  fetchSalaryTrendBySeniority,
  fetchSkillDemand,
  fetchSkillDemandByLocation,
} from "@/lib/market-signals";
import { coerceRecruiterTier } from "@/lib/recruiter-tier";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MarketIntelligence } from "./market-intelligence";

/** B2B market-intelligence product (DESIGN.md §2e/§7). Reads exclusively
 * from the k-anonymized security-definer RPCs (market_skill_demand /
 * market_salary_trend and their Phase 3B by-dimension counterparts) — never
 * a direct table query — so the k-threshold enforced there can't be
 * bypassed from this page. */
export default async function MarketIntelligencePage() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [skillDemand, salaryTrend, skillDemandByLocation, salaryTrendBySeniority, profileData] = await Promise.all([
    fetchSkillDemand(supabase),
    fetchSalaryTrend(supabase),
    fetchSkillDemandByLocation(supabase),
    fetchSalaryTrendBySeniority(supabase),
    supabase.from("profiles").select("recruiter_tier").eq("id", session.userId).single(),
  ]);

  const tier = coerceRecruiterTier(profileData.data?.recruiter_tier);

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <MarketIntelligence
        skillDemand={skillDemand}
        salaryTrend={salaryTrend}
        skillDemandByLocation={skillDemandByLocation}
        salaryTrendBySeniority={salaryTrendBySeniority}
        tier={tier}
      />
    </main>
  );
}
