import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildJobs, buildSeeker, SEEKER_COUNT, sqlString, sqlVector } from "../test-data/generate-smoke-seed";

const DIR = join(__dirname, "..", "test-data");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8"));
}

describe("smoke-test dataset (procedurally generated: 50 seekers + 20 jobs)", () => {
  const recruiters = readJson<
    { id: string; email: string; displayName: string; companyName: string; kind: "tech" | "finance" }[]
  >("smoke-recruiters.json");
  const seekers = Array.from({ length: SEEKER_COUNT }, (_, i) => buildSeeker(i));
  const jobs = buildJobs(recruiters);

  it("has 50 seekers, 20 jobs, and both tech + finance recruiters", () => {
    expect(seekers.length).toBe(50);
    expect(jobs.length).toBe(20);
    expect(recruiters.some((r) => r.kind === "tech")).toBe(true);
    expect(recruiters.some((r) => r.kind === "finance")).toBe(true);
  });

  it("uses well-formed, unique, non-overlapping uuids across all entities", () => {
    const allIds = [...recruiters, ...seekers, ...jobs].map((e) => e.id);
    for (const id of allIds) expect(id).toMatch(UUID_RE);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("uses unique emails for every account", () => {
    const emails = [...recruiters, ...seekers].map((e) => e.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("references only existing recruiters from jobs", () => {
    const recruiterIds = new Set(recruiters.map((r) => r.id));
    for (const job of jobs) expect(recruiterIds.has(job.recruiterId)).toBe(true);
  });

  it("gives every seeker the recruiter-card fields (varied)", () => {
    for (const s of seekers) {
      expect(s.skills.length).toBeGreaterThanOrEqual(5);
      expect(s.yearsExperience).toBeGreaterThanOrEqual(2);
      expect(s.headline).toBeTruthy();
      expect(s.location).toMatch(/Hong Kong|Singapore/);
    }
    // Variety: not everyone has the same years / headline.
    expect(new Set(seekers.map((s) => s.yearsExperience)).size).toBeGreaterThan(3);
    expect(new Set(seekers.map((s) => s.headline)).size).toBeGreaterThan(10);
  });

  it("regenerates the checked-in SQL (run `pnpm test-data:generate` if this fails)", () => {
    const sql = readFileSync(join(DIR, "smoke-seed.generated.sql"), "utf8");
    for (const entity of [...recruiters, ...seekers, ...jobs]) {
      expect(sql).toContain(entity.id);
    }
  });
});

describe("sql escaping helpers", () => {
  it("escapes single quotes for safe SQL string literals", () => {
    expect(sqlString("O'Brien's role")).toBe("'O''Brien''s role'");
  });

  it("formats an embedding as a pgvector literal", () => {
    expect(sqlVector([1, -0.5, 0])).toBe("'[1,-0.5,0]'::vector(1024)");
  });
});
