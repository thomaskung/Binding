import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `get_my_access_log()` (migration 0028) is a real security boundary — it
 * must never let a caller read another user's pii_access_log rows. There is
 * no scratch DB in this environment to exercise the RPC directly (see
 * CLAUDE.md's migrations gotcha), so this asserts on the migration's SQL
 * text instead — the same "assert on the generated artifact" pattern
 * tests/test-data-seed.test.ts already uses. A refactor that accidentally
 * drops the `auth.uid()` scoping, adds a parameter, or loosens the grant
 * fails this test loudly, even though it can't run against a live database.
 */
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "0028_privacy_security_settings.sql",
);
const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("get_my_access_log() migration — SQL-level security boundary", () => {
  it("is security definer with a locked-down search_path", () => {
    expect(sql).toMatch(/create or replace function get_my_access_log\(\)/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
  });

  it("takes no parameters — a p_profile_id-style argument would BE the leak", () => {
    expect(sql).toMatch(/create or replace function get_my_access_log\(\)\s*\n?returns table/);
  });

  it("scopes rows to the caller via auth.uid(), never an argument or another column", () => {
    expect(sql).toMatch(/where log\.subject_id = auth\.uid\(\)/);
  });

  it("grants EXECUTE to authenticated only (not anon, not public)", () => {
    expect(sql).toMatch(/grant execute on function get_my_access_log\(\) to authenticated;/);
    expect(sql).not.toMatch(/grant execute on function get_my_access_log\(\) to (anon|public)/);
  });

  it("gates accessor identity fields inside SQL via a per-row CASE, not an unconditional select", () => {
    // The seeker-tier / hide_name_on_reveal gate must live in the CASE
    // expressions computing accessor_id/recruiter_display_name — not just be
    // documented as an app-side concern. Two CASE blocks expected: one for
    // accessor_id, one for recruiter_display_name.
    const gateClause =
      /case\s+when caller\.seeker_tier = 'pro' and not coalesce\(accessor\.hide_name_on_reveal, false\)/g;
    const matches = sql.match(gateClause) ?? [];
    expect(matches.length).toBe(2);
  });

  it("does not add a new table (only alters profiles + creates the function)", () => {
    expect(sql).not.toMatch(/create table/i);
  });
});
