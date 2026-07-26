import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sqlString, sqlVector } from "../test-data/generate-smoke-seed";

const DIR = join(__dirname, "..", "test-data");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8"));
}

describe("smoke-test dataset", () => {
  const recruiters = readJson<{ id: string; email: string }[]>("smoke-recruiters.json");
  const seekers = readJson<{ id: string; email: string }[]>("smoke-seekers.json");
  const jobs = readJson<{ id: string; recruiterId: string }[]>("smoke-jobs.json");

  it("has at least 10 seeker profiles and 10 jobs", () => {
    expect(seekers.length).toBeGreaterThanOrEqual(10);
    expect(jobs.length).toBeGreaterThanOrEqual(10);
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

  it("generates the checked-in SQL file from the current JSON (run `pnpm test-data:generate` if this fails)", () => {
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
