import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * B2B market-intelligence product (DESIGN.md §2e/§7). The k-anonymity
 * suppression rule lives here as a pure function (unit-testable independent
 * of the database) AND is mirrored in the SQL RPCs themselves
 * (supabase/migrations/0012_market_signals.sql market_skill_demand /
 * market_salary_trend) — those RPCs are the ONLY access path to the
 * underlying candidate data; this module only shapes/reads their output.
 */
export const MARKET_SIGNAL_MIN_COHORT = Number(process.env.MARKET_SIGNAL_MIN_COHORT ?? 20);

/** Same suppression rule as the SQL RPCs: below the cohort threshold, the
 * value is withheld (not the row) so the UI can render an explicit
 * "Not enough data" cell instead of a silently missing one. */
export function suppressBelowCohort<T>(
  rawCount: number,
  value: T,
  minCohort: number = MARKET_SIGNAL_MIN_COHORT,
): { value: T | null; cohortSize: number | null; suppressed: boolean } {
  const suppressed = rawCount < minCohort;
  return {
    value: suppressed ? null : value,
    cohortSize: suppressed ? null : rawCount,
    suppressed,
  };
}

export interface SkillDemandRow {
  skill: string;
  seekerCount: number | null;
  suppressed: boolean;
}

export interface SalaryTrendRow {
  desiredRole: string;
  avgMinSalary: number | null;
  cohortSize: number | null;
  suppressed: boolean;
}

export async function fetchSkillDemand(
  supabase: SupabaseClient,
  minCohort: number = MARKET_SIGNAL_MIN_COHORT,
): Promise<SkillDemandRow[]> {
  const { data, error } = await supabase.rpc("market_skill_demand", { p_min_cohort: minCohort });
  if (error) throw new Error(`market_skill_demand failed: ${error.message}`);
  return (data ?? []).map(
    (r: { skill: string; seeker_count: number | null; suppressed: boolean }) => ({
      skill: r.skill,
      seekerCount: r.seeker_count,
      suppressed: r.suppressed,
    }),
  );
}

export async function fetchSalaryTrend(
  supabase: SupabaseClient,
  minCohort: number = MARKET_SIGNAL_MIN_COHORT,
): Promise<SalaryTrendRow[]> {
  const { data, error } = await supabase.rpc("market_salary_trend", { p_min_cohort: minCohort });
  if (error) throw new Error(`market_salary_trend failed: ${error.message}`);
  return (data ?? []).map(
    (r: {
      desired_role: string;
      avg_min_salary: number | null;
      cohort_size: number | null;
      suppressed: boolean;
    }) => ({
      desiredRole: r.desired_role,
      avgMinSalary: r.avg_min_salary,
      cohortSize: r.cohort_size,
      suppressed: r.suppressed,
    }),
  );
}

/** Phase 3B breakdown dimensions — same k-anonymized-RPC-only access path,
 * same per-cell suppression, see supabase/migrations/0015_market_signals_by_dimension.sql. */
export interface SkillDemandByLocationRow {
  skill: string;
  region: string;
  seekerCount: number | null;
  suppressed: boolean;
}

export interface SalaryTrendBySeniorityRow {
  desiredRole: string;
  seniorityBand: string;
  avgMinSalary: number | null;
  cohortSize: number | null;
  suppressed: boolean;
}

export async function fetchSkillDemandByLocation(
  supabase: SupabaseClient,
  minCohort: number = MARKET_SIGNAL_MIN_COHORT,
): Promise<SkillDemandByLocationRow[]> {
  const { data, error } = await supabase.rpc("market_skill_demand_by_location", {
    p_min_cohort: minCohort,
  });
  if (error) throw new Error(`market_skill_demand_by_location failed: ${error.message}`);
  return (data ?? []).map(
    (r: { skill: string; region: string; seeker_count: number | null; suppressed: boolean }) => ({
      skill: r.skill,
      region: r.region,
      seekerCount: r.seeker_count,
      suppressed: r.suppressed,
    }),
  );
}

export async function fetchSalaryTrendBySeniority(
  supabase: SupabaseClient,
  minCohort: number = MARKET_SIGNAL_MIN_COHORT,
): Promise<SalaryTrendBySeniorityRow[]> {
  const { data, error } = await supabase.rpc("market_salary_trend_by_seniority", {
    p_min_cohort: minCohort,
  });
  if (error) throw new Error(`market_salary_trend_by_seniority failed: ${error.message}`);
  return (data ?? []).map(
    (r: {
      desired_role: string;
      seniority_band: string;
      avg_min_salary: number | null;
      cohort_size: number | null;
      suppressed: boolean;
    }) => ({
      desiredRole: r.desired_role,
      seniorityBand: r.seniority_band,
      avgMinSalary: r.avg_min_salary,
      cohortSize: r.cohort_size,
      suppressed: r.suppressed,
    }),
  );
}
