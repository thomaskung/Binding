import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aesGcmDecrypt,
  deriveKekFromRecoveryCode,
  fromBase64,
  importAesKey,
  unwrapDek,
} from "../src/lib/crypto/envelope";
import {
  assignRecruiterTiers,
  buildAgentTokenPlan,
  buildConnectedAccountPlan,
  buildJobs,
  buildKeyCustody,
  buildReferralPlan,
  buildSeeker,
  buildSeekerExperience,
  SEEKER_COUNT,
  sqlString,
  sqlVector,
  type RecruiterJson,
} from "../test-data/generate-smoke-seed";

const DIR = join(__dirname, "..", "test-data");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERRAL_DAILY_CAP = 10; // must match src/lib/points.ts

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8"));
}

describe("smoke-test dataset (procedurally generated: 50 seekers + 20 jobs)", () => {
  const recruiters = assignRecruiterTiers(readJson<RecruiterJson[]>("smoke-recruiters.json"));
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

  it("assigns all 4 recruiter tiers across the 8 companies (0020)", () => {
    const tiers = new Set(recruiters.map((r) => r.recruiterTier));
    expect(tiers).toEqual(new Set(["free", "solo", "advanced", "pro_saas"]));
  });

  it("mixes seeker tiers, salary-share, and consent variance rather than uniform grants (0006/0016/0025/0027/0032)", () => {
    expect(seekers.some((s) => s.seekerTier === "pro")).toBe(true);
    expect(seekers.some((s) => s.seekerTier === "free")).toBe(true);
    expect(seekers.some((s) => s.shareSalary)).toBe(true);
    expect(seekers.some((s) => !s.shareSalary)).toBe(true);
    expect(seekers.some((s) => s.maintenanceConsentWithdrawn)).toBe(true);
    expect(seekers.some((s) => !s.maintenanceConsentWithdrawn)).toBe(true);
    expect(seekers.some((s) => s.agentAccessOptIn)).toBe(true);
    expect(seekers.some((s) => s.connectedAccountsOptIn)).toBe(true);
  });

  it("has exactly one dual-role account (is_seeker AND is_recruiter on the same profile)", () => {
    expect(seekers.filter((s) => s.isDualRoleRecruiter)).toHaveLength(1);
  });

  it("covers all 3 salary_visibility values and some equity offers across jobs (0019/0025)", () => {
    const visibilities = new Set(jobs.map((j) => j.salaryVisibility));
    expect(visibilities).toEqual(new Set(["on_request", "band", "public"]));
    expect(jobs.some((j) => j.offersEquity)).toBe(true);
  });

  it("builds structured work history only for the flagged 1-in-3 seekers, with valid date ordering (0008)", () => {
    const rows = buildSeekerExperience(seekers);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.seekerIdx % 3).toBe(0);
      if (r.endMonthsAgo !== null) expect(r.startMonthsAgo).toBeGreaterThan(r.endMonthsAgo);
    }
  });

  it("referral plan covers activated + stuck-at-cap signed_up states, and the cap group hits exactly REFERRAL_DAILY_CAP (0029)", () => {
    const plan = buildReferralPlan();
    const statuses = new Set(plan.map((r) => r.status));
    expect(statuses).toEqual(new Set(["activated", "signed_up"]));
    // referrer/referee ids must resolve to real seeker indices.
    for (const r of plan) {
      expect(r.referrerIdx).toBeGreaterThanOrEqual(0);
      expect(r.referrerIdx).toBeLessThan(SEEKER_COUNT);
      expect(r.refereeIdx).toBeGreaterThanOrEqual(0);
      expect(r.refereeIdx).toBeLessThan(SEEKER_COUNT);
    }
    const byReferrer = new Map<number, typeof plan>();
    for (const r of plan) byReferrer.set(r.referrerIdx, [...(byReferrer.get(r.referrerIdx) ?? []), r]);
    const capReferrer = [...byReferrer.entries()].find(([, rows]) => rows.filter((r) => r.status === "activated").length >= REFERRAL_DAILY_CAP);
    expect(capReferrer).toBeDefined();
    const [, rows] = capReferrer!;
    expect(rows.filter((r) => r.status === "activated")).toHaveLength(REFERRAL_DAILY_CAP);
    expect(rows.some((r) => r.status === "signed_up")).toBe(true);
    // All rows for the at-cap referrer share one calendar day, and it's never "today" (daysAgo > 0).
    const capRows = rows.filter((r) => r.status === "activated" || r.status === "signed_up");
    expect(new Set(capRows.map((r) => r.daysAgo)).size).toBe(1);
    expect(capRows[0]!.daysAgo).toBeGreaterThan(0);
  });

  it("agent-token plan targets seekers who actually opted into agent access, with at least one revoked (0031/0032)", () => {
    const plan = buildAgentTokenPlan();
    expect(plan.some((t) => t.revoked)).toBe(true);
    expect(plan.some((t) => !t.revoked)).toBe(true);
    for (const t of plan) expect(seekers[t.seekerIdx]!.agentAccessOptIn).toBe(true);
  });

  it("connected-account plan targets seekers who actually opted in (0026/0027)", () => {
    const plan = buildConnectedAccountPlan();
    for (const c of plan) expect(seekers[c.seekerIdx]!.connectedAccountsOptIn).toBe(true);
  });

  it("key custody plan has the right shape — 8 recovery codes, real hash/salt encoding, primary wrap matches the first recovery row (0030)", async () => {
    const plan = await buildKeyCustody(3);
    expect(plan.recoveryCodes.length).toBe(8); // RECOVERY_CODE_COUNT
    expect(plan.wrappedDekPrimary).toBe(plan.recoveryCodes[0]!.wrappedDek);
    for (const code of plan.recoveryCodes) {
      expect(code.codeHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
      expect(fromBase64(code.salt).length).toBe(16);
      expect(code.wrappedDek.length).toBeGreaterThan(0);
    }
    expect(plan.encryptedRawTextB64.length).toBeGreaterThan(0);
    // The generator only returns codeHash/salt/wrappedDek — never the raw
    // recovery code itself (matches the real app's "never persist the code"
    // posture) — so the actual decrypt round-trip is verified separately
    // below using fresh envelope.ts primitives, not this plan's own output.
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

describe("key custody crypto (envelope.ts direct round-trip)", () => {
  it("a fresh recovery-code DEK wrap genuinely decrypts under its own derived KEK", async () => {
    const { generateDataKey, generateRecoveryCode, randomBytes, wrapDek, encryptText } = await import("../src/lib/crypto/envelope");
    const dek = generateDataKey();
    const dekKey = await importAesKey(dek);
    const code = generateRecoveryCode();
    const salt = randomBytes(16);
    const kek = await deriveKekFromRecoveryCode(code, salt);
    const wrapped = await wrapDek(kek, dek);
    const ciphertext = await encryptText(dekKey, "real plaintext for round-trip verification");

    // Redeem: re-derive the same KEK from the same code+salt, unwrap the DEK.
    const kek2 = await deriveKekFromRecoveryCode(code, salt);
    const unwrappedDek = await unwrapDek(kek2, wrapped);
    const unwrappedDekKey = await importAesKey(unwrappedDek);
    const plaintext = new TextDecoder().decode(await aesGcmDecrypt(unwrappedDekKey, fromBase64(ciphertext)));
    expect(plaintext).toBe("real plaintext for round-trip verification");
  });
});
