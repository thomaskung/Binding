import { describe, expect, it } from "vitest";
import { credentialsFloorSummary, credentialsLooksSafe, parseCredentialItems } from "@/lib/credentials";

describe("credentials generalization (floor + guard)", () => {
  it("rolls free-text into a de-identified category+count summary", () => {
    const raw =
      "Patent US10,123,456 for a fraud-detection graph algorithm; AWS SA Pro; CKA; won FinTech HK 2023 Innovator award";
    const summary = credentialsFloorSummary(raw);
    // Categories + counts, never the specifics.
    expect(summary).toContain("patent");
    expect(summary).toContain("certification");
    expect(summary).toContain("award");
    expect(summary).not.toMatch(/US10,?123,?456/);
    expect(summary).not.toMatch(/2023/);
    expect(summary).not.toMatch(/FinTech HK/);
  });

  it("pluralizes and counts correctly", () => {
    expect(credentialsFloorSummary("2 patents; 1 patent in ML")).toBe("2 patents");
    expect(credentialsFloorSummary("CISSP")).toBe("1 certification");
    expect(credentialsFloorSummary("")).toBe("");
  });

  it("parseCredentialItems splits on separators but not commas inside parens", () => {
    expect(parseCredentialItems("CISSP; AWS SA (Professional, 2023)")).toEqual([
      "CISSP",
      "AWS SA (Professional, 2023)",
    ]);
  });

  it("credentialsLooksSafe rejects anything with a specific identifier", () => {
    expect(credentialsLooksSafe("patent-holder · cloud-certified")).toBe(true);
    expect(credentialsLooksSafe("Patent US10123456")).toBe(false); // number
    expect(credentialsLooksSafe("won award in 2023")).toBe(false); // year
    expect(credentialsLooksSafe("see https://patents.example")).toBe(false); // url
    expect(credentialsLooksSafe("")).toBe(false);
  });
});
