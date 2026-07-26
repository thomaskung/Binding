import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * Market intelligence's Phase 3B breakdown dimensions (skill-by-location,
 * salary-by-seniority) — DB-level, not UI-level: this proves the k-anonymity
 * suppression math directly against the new RPCs, since the interesting
 * risk here is SQL-side (per-cell cohort counting), not the client render.
 *
 * The critical regression this guards against: `seniority_band` is a
 * STORED scalar on `profiles`, not derived by joining `seeker_experience`
 * inline — because that table has multiple rows per person, an inline join
 * would let one person's several experience rows inflate a cohort count
 * above the min-cohort threshold (exactly what suppression exists to
 * prevent). Profile B below has TWO seeker_experience rows specifically to
 * prove that doesn't happen: the "mid" cohort must read 3 (distinct
 * people), never 4.
 *
 * Profiles are inserted directly via the admin client (bypassing the full
 * onboarding wizard) since this test is about RPC/SQL correctness, not the
 * UI flow — same posture as training-benefits.spec.ts's direct ledger
 * insert. A small p_min_cohort (3) is passed directly to the RPCs so the
 * test doesn't need 20+ seeded profiles to exercise both sides of the
 * threshold.
 */

const PASSWORD = "J0B!Demo#2026$secure";
const EMAILS = [
  "mi-dim-a@e2e.local",
  "mi-dim-b@e2e.local",
  "mi-dim-c@e2e.local",
  "mi-dim-d@e2e.local",
];

function adminClient(): SupabaseClient {
  const env: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function ensureUserId(admin: SupabaseClient, email: string): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (data.user) return data.user.id;
    if (error?.code === "email_exists") {
      const {
        data: { users },
      } = await admin.auth.admin.listUsers();
      const existing = users.find((u) => u.email === email);
      if (existing) return existing.id;
    }
    if (attempt === 5) throw new Error(`createUser failed: ${error?.message ?? JSON.stringify(error)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error("unreachable");
}

test("skill-by-location and salary-by-seniority: a cell over the cohort threshold reads real values, a thinner cell suppresses, and a multi-experience-row profile doesn't inflate its cell's count", async () => {
  const admin = adminClient();
  const [idA, idB, idC, idD] = await Promise.all(EMAILS.map((e) => ensureUserId(admin, e)));

  const commonFields = {
    is_seeker: true,
    visibility: "active",
    skills: ["Rust"],
    desired_roles: ["Backend Engineer"],
    dealbreaker_matrix: { min_salary: 150000, currency: "USD", work_setups: [] },
  };

  await admin.from("profiles").upsert([
    { id: idA, display_name: "MI Dim A", location: "Austin, TX", seniority_band: "mid", ...commonFields },
    { id: idB, display_name: "MI Dim B", location: "Austin, TX", seniority_band: "mid", ...commonFields },
    { id: idC, display_name: "MI Dim C", location: "Austin, TX", seniority_band: "mid", ...commonFields },
    { id: idD, display_name: "MI Dim D", location: "Seattle, WA", seniority_band: "staff", ...commonFields },
  ]);

  await admin.from("consent_flags").upsert(
    [idA, idB, idC, idD].map((profile_id) => ({
      profile_id,
      market_signals_opt_in_at: new Date().toISOString(),
    })),
  );

  // B alone gets two seeker_experience rows — the regression this test
  // exists to catch: this must NOT make B count twice in any cohort.
  await admin.from("seeker_experience").delete().eq("profile_id", idB);
  await admin.from("seeker_experience").insert([
    { profile_id: idB, role: "Engineer", company: "Alpha Co", start_date: "2019-01-01", end_date: "2020-06-01" },
    { profile_id: idB, role: "Engineer", company: "Beta Co", start_date: "2021-01-01", end_date: "2022-07-01" },
  ]);

  const [{ data: byLocation, error: locErr }, { data: bySeniority, error: senErr }] = await Promise.all([
    admin.rpc("market_skill_demand_by_location", { p_min_cohort: 3 }),
    admin.rpc("market_salary_trend_by_seniority", { p_min_cohort: 3 }),
  ]);
  expect(locErr).toBeNull();
  expect(senErr).toBeNull();

  const austin = byLocation!.find((r: { skill: string; region: string }) => r.region === "Austin, TX");
  const seattle = byLocation!.find((r: { skill: string; region: string }) => r.region === "Seattle, WA");
  expect(austin.suppressed).toBe(false);
  expect(austin.seeker_count).toBe(3); // A, B, C — B's 2 experience rows must not inflate this
  expect(seattle.suppressed).toBe(true);
  expect(seattle.seeker_count).toBeNull();

  const mid = bySeniority!.find((r: { seniority_band: string }) => r.seniority_band === "mid");
  const staff = bySeniority!.find((r: { seniority_band: string }) => r.seniority_band === "staff");
  expect(mid.suppressed).toBe(false);
  expect(mid.cohort_size).toBe(3); // A, B, C — same regression check on this dimension
  expect(Number(mid.avg_min_salary)).toBe(150000);
  expect(staff.suppressed).toBe(true);
  expect(staff.avg_min_salary).toBeNull();
});
