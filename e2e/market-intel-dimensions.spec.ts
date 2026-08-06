import { expect, test } from "@playwright/test";
import { ensureStagingUser, stagingAdminClient, uniqueLabel } from "./staging-helpers";

/**
 * Market intelligence's Phase 3B breakdown dimensions (skill-by-location,
 * salary-by-seniority) — DB-level, not UI-level: this proves the k-anonymity
 * suppression math directly against the new RPCs, since the interesting
 * risk here is SQL-side (per-cell cohort counting), not the client render.
 * No `page`/`stagingContext` is needed — the RPCs are hit directly over the
 * Supabase service-role client, which sits in front of Postgres, not behind
 * the Vercel/staging middleware gate.
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
 * Isolation contract for a shared, never-reset staging DB: staging is
 * seeded with ~50 real seekers that also opted into market signals
 * (scripts/seed-staging.ts), so this spec cannot rely on "the Austin cohort"
 * or "the mid cohort" being cells this test alone controls — other real
 * data may already occupy them, at any count. Instead, the `skill` and
 * `desired_role` values below are generated fresh per test run
 * (`uniqueLabel`) and used nowhere else, ever. Both RPCs group by
 * `(skill, region)` / `(desired_role, seniority_band)` respectively, so a
 * cell keyed on a run-unique skill/role can only ever contain the four
 * profiles this test itself inserts, regardless of what else lands in the
 * shared DB before or after this run. That is what makes the EXACT count
 * assertions below (3, never "at least 3") still valid on hosted staging —
 * do not loosen them to `toBeGreaterThan`/presence-only, that would delete
 * the regression this spec exists to catch. p_min_cohort is still passed as
 * a small literal (3) directly to the RPCs so the test doesn't depend on
 * the shared DB happening to have 20+ profiles in an isolated cell to
 * exercise both sides of the suppression threshold.
 *
 * Profiles are inserted directly via the admin client (bypassing the full
 * onboarding wizard) since this test is about RPC/SQL correctness, not the
 * UI flow. Zero Modal AI calls: this spec only writes rows and calls two
 * SQL-only security-definer RPCs, no publish/embed/reveal path is touched.
 */

test("skill-by-location and salary-by-seniority: a cell over the cohort threshold reads real values, a thinner cell suppresses, and a multi-experience-row profile doesn't inflate its cell's count", async () => {
  test.setTimeout(120_000);
  const admin = stagingAdminClient();

  const users = await Promise.all([
    ensureStagingUser("seeker"),
    ensureStagingUser("seeker"),
    ensureStagingUser("seeker"),
    ensureStagingUser("seeker"),
  ]);
  for (const u of users) {
    if (!u.id) throw new Error(`ensureStagingUser returned no id for ${u.email} (email collision)`);
  }
  const [idA, idB, idC, idD] = users.map((u) => u.id) as [string, string, string, string];

  // Everything from here down writes market-signal-opted-in profiles into
  // the shared DB, so it's wrapped in try/finally: a mid-setup failure
  // (e.g. a hosted-Supabase blip on the seeker_experience insert) must not
  // leave orphaned, un-cleaned-up profiles behind — see the finally block.
  try {
    // Run-unique skill/role so the two cells under assertion below can only
    // ever contain this test's own four profiles — see isolation contract
    // above. Region/seniority-band values don't need to be unique themselves
    // since the group-by key includes the unique skill/role.
    const skill = uniqueLabel("MiDimSkill");
    const desiredRole = uniqueLabel("MiDimRole");

    const commonFields = {
      is_seeker: true,
      visibility: "active",
      skills: [skill],
      desired_roles: [desiredRole],
      dealbreaker_matrix: { min_salary: 150000, currency: "USD", work_setups: [] },
    };

    const { error: profileErr } = await admin.from("profiles").upsert([
      { id: idA, display_name: uniqueLabel("MI Dim A"), location: "Austin, TX", seniority_band: "mid", ...commonFields },
      { id: idB, display_name: uniqueLabel("MI Dim B"), location: "Austin, TX", seniority_band: "mid", ...commonFields },
      { id: idC, display_name: uniqueLabel("MI Dim C"), location: "Austin, TX", seniority_band: "mid", ...commonFields },
      { id: idD, display_name: uniqueLabel("MI Dim D"), location: "Seattle, WA", seniority_band: "staff", ...commonFields },
    ]);
    if (profileErr) throw new Error(`profiles upsert failed: ${profileErr.message}`);

    const { error: consentErr } = await admin.from("consent_flags").upsert(
      [idA, idB, idC, idD].map((profile_id) => ({
        profile_id,
        market_signals_opt_in_at: new Date().toISOString(),
      })),
    );
    if (consentErr) throw new Error(`consent_flags upsert failed: ${consentErr.message}`);

    // B alone gets two seeker_experience rows — the regression this test
    // exists to catch: this must NOT make B count twice in any cohort.
    await admin.from("seeker_experience").delete().eq("profile_id", idB);
    const { error: expErr } = await admin.from("seeker_experience").insert([
      { profile_id: idB, role: "Engineer", company: "Alpha Co", start_date: "2019-01-01", end_date: "2020-06-01" },
      { profile_id: idB, role: "Engineer", company: "Beta Co", start_date: "2021-01-01", end_date: "2022-07-01" },
    ]);
    if (expErr) throw new Error(`seeker_experience insert failed: ${expErr.message}`);

    const [{ data: byLocation, error: locErr }, { data: bySeniority, error: senErr }] = await Promise.all([
      admin.rpc("market_skill_demand_by_location", { p_min_cohort: 3 }),
      admin.rpc("market_salary_trend_by_seniority", { p_min_cohort: 3 }),
    ]);
    expect(locErr).toBeNull();
    expect(senErr).toBeNull();

    const austin = byLocation!.find(
      (r: { skill: string; region: string }) => r.skill === skill && r.region === "Austin, TX",
    );
    const seattle = byLocation!.find(
      (r: { skill: string; region: string }) => r.skill === skill && r.region === "Seattle, WA",
    );
    expect(austin).toBeDefined();
    expect(seattle).toBeDefined();
    expect(austin.suppressed).toBe(false);
    expect(austin.seeker_count).toBe(3); // A, B, C — B's 2 experience rows must not inflate this
    expect(seattle.suppressed).toBe(true);
    expect(seattle.seeker_count).toBeNull();

    const mid = bySeniority!.find(
      (r: { desired_role: string; seniority_band: string }) =>
        r.desired_role === desiredRole && r.seniority_band === "mid",
    );
    const staff = bySeniority!.find(
      (r: { desired_role: string; seniority_band: string }) =>
        r.desired_role === desiredRole && r.seniority_band === "staff",
    );
    expect(mid).toBeDefined();
    expect(staff).toBeDefined();
    expect(mid.suppressed).toBe(false);
    expect(mid.cohort_size).toBe(3); // A, B, C — same regression check on this dimension
    expect(Number(mid.avg_min_salary)).toBe(150000);
    expect(staff.suppressed).toBe(true);
    expect(staff.avg_min_salary).toBeNull();
  } finally {
    // These profiles opt into market signals and are visibility:'active' —
    // left alive they'd permanently pollute the real cohorts other specs/UI
    // read (seed-staging.ts's wipe only targets @smoke.local/@demo.local,
    // never these @staging.local users). deleteUser() resolves with
    // {data,error} rather than rejecting, so a failed cascade must be
    // checked explicitly — a bare .catch() here would silently swallow
    // nothing and let the pollution accumulate unnoticed. Deliberately
    // best-effort (warn, don't throw) so a delete failure never masks an
    // assertion failure from the try block above.
    for (const id of [idA, idB, idC, idD]) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete staging user ${id}: ${error.message}`);
    }
  }
});
