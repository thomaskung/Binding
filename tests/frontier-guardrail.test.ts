import { describe, expect, it } from "vitest";
import { assertJDTextOnly, type JDTextOnly } from "@/lib/ai/types";

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
