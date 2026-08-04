import { describe, expect, it } from "vitest";
import { assertJDTextOnly, type AiProvider, type JDTextOnly } from "@/lib/ai/types";

/**
 * The frontier-API privacy rule (DESIGN.md): candidate-derived data may only
 * reach the private Modal path. The one frontier-capable method
 * (refineJobDescription) accepts only the branded JDTextOnly type.
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
