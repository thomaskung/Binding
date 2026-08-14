import { describe, expect, it } from "vitest";
import { stubProvider } from "@/lib/ai/stub";

describe("stub redaction", () => {
  it("strips emails, phones and years", async () => {
    const { redactedText } = await stubProvider.redact(
      "Jane Doe, jane@corp.com, +852 9123 4567, engineer since 2015 with 8 years experience",
    );
    expect(redactedText).not.toContain("jane@corp.com");
    expect(redactedText).not.toContain("9123");
    expect(redactedText).not.toContain("2015");
    expect(redactedText).toContain("[EMAIL]");
    expect(redactedText).toContain("[YEARS] years");
  });
});

describe("stub embeddings", () => {
  it("returns a 1024-dim unit vector", async () => {
    const vec = await stubProvider.embed("distributed systems postgres kubernetes");
    expect(vec).toHaveLength(1024);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("is deterministic", async () => {
    const a = await stubProvider.embed("backend engineer");
    const b = await stubProvider.embed("backend engineer");
    expect(a).toEqual(b);
  });

  it("scores similar texts above dissimilar ones", async () => {
    const profile = await stubProvider.embed(
      "senior backend engineer distributed systems postgres kubernetes payments",
    );
    const similarJob = await stubProvider.embed(
      "backend engineer role: distributed systems, postgres, kubernetes",
    );
    const differentJob = await stubProvider.embed(
      "graphic designer branding illustrator typography portfolio",
    );
    const cos = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * (y[i] ?? 0), 0);
    expect(cos(profile, similarJob)).toBeGreaterThan(cos(profile, differentJob));
  });
});

describe("stub profile-field extraction", () => {
  it("finds skills, industries and work-history entries actually present in the text", async () => {
    const resume = [
      "Senior Backend Engineer, Acme Pay (2021 - 2024)",
      "Backend Engineer at Nimbus Logistics (2018-2021)",
      "Built payment pipelines with TypeScript, PostgreSQL and Kubernetes for a Fintech platform.",
    ].join("\n");
    const result = await stubProvider.extractProfileFields(resume);
    expect(result.skills).toEqual(expect.arrayContaining(["TypeScript", "PostgreSQL", "Kubernetes"]));
    expect(result.industries).toContain("Fintech");
    expect(result.experience).toHaveLength(2);
    expect(result.experience[0]).toMatchObject({
      role: "Senior Backend Engineer",
      company: "Acme Pay",
      startDate: "2021-01-01",
      endDate: "2024-12-31",
    });
    expect(result.roles).toEqual(["Senior Backend Engineer", "Backend Engineer"]);
  });

  it("never invents skills/industries not present in the text", async () => {
    const result = await stubProvider.extractProfileFields("A person who enjoys hiking and painting.");
    expect(result.skills).toEqual([]);
    expect(result.industries).toEqual([]);
    expect(result.experience).toEqual([]);
  });

  it("treats an open-ended end year as ongoing", async () => {
    const result = await stubProvider.extractProfileFields("Staff Engineer, Nimbus Core (2023 - Present)");
    expect(result.experience[0]?.endDate).toBeNull();
  });
});

describe("stub maintenance-update draft", () => {
  it("restructures only what the user supplied", async () => {
    const draft = await stubProvider.draftMaintenanceUpdate(
      "Senior Backend Engineer at Acme Pay.",
      "led the migration to event-driven payments this year",
    );
    expect(draft).toBe("led the migration to event-driven payments this year.");
  });

  it("returns empty for a blank answer rather than fabricating content", async () => {
    expect(await stubProvider.draftMaintenanceUpdate("current profile", "   ")).toBe("");
  });
});

describe("stub fit-summary", () => {
  it("returns a deterministic summary for any input", async () => {
    const summary = await stubProvider.fitSummary(
      "backend engineer with distributed systems and postgres",
      "Backend Engineer role requiring distributed systems experience",
    );
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same inputs", async () => {
    const a = await stubProvider.fitSummary("candidate a", "job x");
    const b = await stubProvider.fitSummary("candidate a", "job x");
    expect(a).toBe(b);
  });
});

describe("stub refine-profile", () => {
  it("returns the input unchanged for a blank instruction", async () => {
    const refined = await stubProvider.refineProfile("senior engineer go rust distributed");
    expect(refined).toBe("senior engineer go rust distributed");
  });

  it("appends the instruction as a suffix when given", async () => {
    const refined = await stubProvider.refineProfile("senior engineer", "add metrics");
    expect(refined).toContain("senior engineer");
    expect(refined).toContain("add metrics");
  });
});

describe("stub refine-job-description", () => {
  it("returns the JD unchanged (stub)", async () => {
    const jd = "Backend Engineer" as import("@/lib/ai/types").JDTextOnly;
    const refined = await stubProvider.refineJobDescription(jd);
    expect(refined).toBe(jd);
  });
});

describe("stub job-field extraction (paste-JD)", () => {
  const jd = [
    "Senior Backend Engineer",
    "Department: Platform Engineering",
    "",
    "Responsibilities:",
    "- Own the payments ledger service",
    "- Scale core services for a Fintech platform",
    "",
    "Requirements:",
    "- 6+ years with TypeScript, PostgreSQL and Kubernetes",
    "- Experience with distributed systems",
  ].join("\n");

  it("extracts title, department, skills and bulleted sections", async () => {
    const draft = await stubProvider.extractJobFields(jd as unknown as import("@/lib/ai/types").JDTextOnly);
    expect(draft.title).toBe("Senior Backend Engineer");
    expect(draft.department).toBe("Platform Engineering");
    expect(draft.skills).toEqual(expect.arrayContaining(["TypeScript", "PostgreSQL", "Kubernetes"]));
    expect(draft.responsibilities).toEqual([
      "Own the payments ledger service",
      "Scale core services for a Fintech platform",
    ]);
    expect(draft.requirements).toEqual([
      "6+ years with TypeScript, PostgreSQL and Kubernetes",
      "Experience with distributed systems",
    ]);
  });

  it("is deterministic for the same input", async () => {
    const jdText = jd as unknown as import("@/lib/ai/types").JDTextOnly;
    const a = await stubProvider.extractJobFields(jdText);
    const b = await stubProvider.extractJobFields(jdText);
    expect(a).toEqual(b);
  });

  it("never invents skills, department or bullets not present in the text", async () => {
    const plain = "A short note about the team culture and mission." as unknown as import(
      "@/lib/ai/types"
    ).JDTextOnly;
    const draft = await stubProvider.extractJobFields(plain);
    expect(draft.skills).toEqual([]);
    expect(draft.department).toBeNull();
    expect(draft.responsibilities).toEqual([]);
    expect(draft.requirements).toEqual([]);
  });

  it("drops bullets that appear before any recognized section header", async () => {
    const noHeader = "Some role\n- a bullet with no section above it" as unknown as import(
      "@/lib/ai/types"
    ).JDTextOnly;
    const draft = await stubProvider.extractJobFields(noHeader);
    expect(draft.responsibilities).toEqual([]);
    expect(draft.requirements).toEqual([]);
  });
});

describe("stub job generation (generate mode)", () => {
  it("builds a deterministic scaffold from the prompt cues", async () => {
    const prompt = "Senior Backend Engineer, fintech, remote" as unknown as import(
      "@/lib/ai/types"
    ).JDTextOnly;
    const draft = await stubProvider.generateJob(prompt);
    expect(draft.title).toBe("Senior Backend Engineer");
    expect(draft.department).toBeNull();
    expect(draft.responsibilities.length).toBeGreaterThan(0);
    expect(draft.requirements.length).toBeGreaterThan(0);
    expect(draft.description).toContain("Senior Backend Engineer");
  });

  it("is deterministic for the same prompt", async () => {
    const prompt = "Staff Data Engineer, healthtech" as unknown as import("@/lib/ai/types").JDTextOnly;
    const a = await stubProvider.generateJob(prompt);
    const b = await stubProvider.generateJob(prompt);
    expect(a).toEqual(b);
  });

  it("makes no network call and falls back to a generic title for an empty prompt", async () => {
    const draft = await stubProvider.generateJob("" as unknown as import("@/lib/ai/types").JDTextOnly);
    expect(draft.title).toBe("New role");
    expect(draft.skills).toEqual([]);
  });

  it("only lists skills actually mentioned in the prompt", async () => {
    const prompt = "Frontend Designer, no backend keywords here" as unknown as import(
      "@/lib/ai/types"
    ).JDTextOnly;
    const draft = await stubProvider.generateJob(prompt);
    expect(draft.skills).toEqual([]);
  });
});

describe("stub generalize-credentials", () => {
  it("returns a category-count rollup for known certs", async () => {
    const result = await stubProvider.generalizeCredentials(
      "AWS Solutions Architect Professional, Certified Kubernetes Administrator, PMP",
    );
    expect(result).toContain("3 certifications");
  });

  it("returns empty for empty input", async () => {
    expect(await stubProvider.generalizeCredentials("")).toBe("");
  });

  it("is deterministic", async () => {
    const a = await stubProvider.generalizeCredentials("AWS SA Pro, CKA");
    const b = await stubProvider.generalizeCredentials("AWS SA Pro, CKA");
    expect(a).toBe(b);
  });
});
