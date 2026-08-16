import { describe, expect, it } from "vitest";
import { COMPANY_RESEARCH_DAILY_CAP, COMPANY_RESEARCH_DISCLAIMER, companyResearchCapGuard } from "@/lib/company-research";

describe("COMPANY_RESEARCH_DISCLAIMER", () => {
  it("labels the content as AI-researched and non-official", () => {
    expect(COMPANY_RESEARCH_DISCLAIMER.toLowerCase()).toContain("ai-researched");
    expect(COMPANY_RESEARCH_DISCLAIMER.toLowerCase()).toContain("not verified or official");
  });
});

describe("COMPANY_RESEARCH_DAILY_CAP", () => {
  it("is a positive number", () => {
    expect(COMPANY_RESEARCH_DAILY_CAP).toBeGreaterThan(0);
  });
});

describe("companyResearchCapGuard", () => {
  it("allows a request under the cap", () => {
    expect(companyResearchCapGuard(0, 10)).toBeNull();
    expect(companyResearchCapGuard(9, 10)).toBeNull();
  });

  it("blocks at and above the cap (checked before any real spend)", () => {
    expect(companyResearchCapGuard(10, 10)).toMatch(/daily company-research limit/);
    expect(companyResearchCapGuard(11, 10)).toMatch(/daily company-research limit/);
  });
});
