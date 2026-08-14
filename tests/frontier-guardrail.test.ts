import { describe, expect, it } from "vitest";
import { assertJDTextOnly, type AiProvider, type JDTextOnly } from "@/lib/ai/types";

/**
 * The frontier-API privacy rule (DESIGN.md): candidate-derived data may only
 * reach the private Modal path. Every frontier-CAPABLE method (recruiter-
 * authored JD text only — `refineJobDescription`, and Phase 8's
 * `extractJobFields`/`generateJob`) accepts only the branded JDTextOnly type.
 * "Capable" doesn't mean every implementation actually calls a frontier API
 * today (all three currently route through Modal, per src/lib/ai/modal.ts) —
 * it means the input is safe to send there if a future implementation does.
 *
 * The brand is compile-time enforcement — these tests document the invariant
 * and pin the boundary function's behavior, and the @ts-expect-error lines
 * turn "someone weakened the type" into a typecheck failure.
 */
describe("JDTextOnly boundary", () => {
  it("brands recruiter-authored text", () => {
    const jd: JDTextOnly = assertJDTextOnly("We are hiring a backend engineer…");
    expect(typeof jd).toBe("string");
  });

  it("rejects unbranded strings at compile time", () => {
    // @ts-expect-error — a raw string must NOT be assignable to JDTextOnly;
    // if this line stops erroring, the privacy boundary has been weakened.
    const leak: JDTextOnly = "candidate resume text";
    expect(leak).toBeDefined();
  });

  it("rejects candidate-shaped objects at compile time", () => {
    interface CandidateDerived {
      redactedText: string;
    }
    const candidate: CandidateDerived = { redactedText: "…" };
    // @ts-expect-error — candidate-derived fields can't be passed where
    // JDTextOnly is required without going through assertJDTextOnly.
    const leak: JDTextOnly = candidate.redactedText as string;
    expect(leak).toBeDefined();
  });
});

/**
 * Phase 8's two new job-authoring capabilities are recruiter-authored-input
 * only (a pasted external JD, or a short generation prompt the recruiter
 * typed) — same frontier-capable posture as refineJobDescription, so both
 * must require JDTextOnly, not a plain string. Pinned the same direction as
 * the JDTextOnly boundary tests above: if either signature is ever loosened
 * to accept a plain string, that would silently make it possible to pass
 * candidate-derived text through without going via assertJDTextOnly.
 */
describe("job-authoring capabilities stay frontier-capable (JDTextOnly-gated)", () => {
  const emptyDraft = { title: "", department: null, skills: [], responsibilities: [], requirements: [], description: "" };

  it("extractJobFields cannot be called with a plain string — only JDTextOnly", async () => {
    const extractJobFields: AiProvider["extractJobFields"] = async () => emptyDraft;
    // @ts-expect-error — a bare string literal must NOT satisfy the JDTextOnly
    // parameter; only assertJDTextOnly()'s branded output may be passed here.
    await extractJobFields("some pasted JD text");
    expect(await extractJobFields(assertJDTextOnly("some pasted JD text"))).toEqual(emptyDraft);
  });

  it("generateJob cannot be called with a plain string — only JDTextOnly", async () => {
    const generateJob: AiProvider["generateJob"] = async () => emptyDraft;
    // @ts-expect-error — same pin as above, for generateJob's prompt param.
    await generateJob("senior backend engineer, fintech, remote");
    expect(await generateJob(assertJDTextOnly("senior backend engineer, fintech, remote"))).toEqual(emptyDraft);
  });
});

/**
 * The two candidate-derived AI capabilities (resume-field extraction, the
 * maintenance-nudge draft) are private-path only, same as redact/embed/
 * refineProfile — they must take a plain `string`, never JDTextOnly. Pinning
 * this the other direction from the tests above: if either signature is ever
 * changed to require JDTextOnly, that would (wrongly) suggest candidate data
 * is safe to send to a frontier API.
 */
describe("candidate-derived AI capabilities stay off the frontier-capable path", () => {
  it("extractProfileFields takes plain resume text, not JDTextOnly", () => {
    const extract: AiProvider["extractProfileFields"] = async (resumeText) => {
      // @ts-expect-error — a JDTextOnly-only signature must NOT compile here;
      // if this stops erroring, extraction was wrongly branded frontier-capable.
      const _wouldRequireBrand: JDTextOnly = resumeText;
      return { skills: [], roles: [], industries: [], experience: [] };
    };
    expect(typeof extract).toBe("function");
  });

  it("draftMaintenanceUpdate takes plain strings, not JDTextOnly", () => {
    const draft: AiProvider["draftMaintenanceUpdate"] = async (summary, answer) => {
      // @ts-expect-error — same pin as above, for both parameters.
      const _wouldRequireBrand: JDTextOnly = summary;
      return answer;
    };
    expect(typeof draft).toBe("function");
  });

  it("generalizeCredentials takes plain candidate credentials, not JDTextOnly", () => {
    // Raw credentials are candidate-derived → Modal-only, never a frontier API.
    const generalize: AiProvider["generalizeCredentials"] = async (rawCredentials) => {
      // @ts-expect-error — if this compiles, credentials were wrongly branded
      // frontier-capable and could leak to a frontier API.
      const _wouldRequireBrand: JDTextOnly = rawCredentials;
      return "";
    };
    expect(typeof generalize).toBe("function");
  });
});
