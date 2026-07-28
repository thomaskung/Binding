import { describe, expect, it } from "vitest";
import { describePiiCategories, stripPiiPatterns } from "@/lib/pii-patterns";

describe("stripPiiPatterns — emails", () => {
  it("strips emails and reports the category", () => {
    const r = stripPiiPatterns("Contact: wei.ling+jobs@example.com.sg for details");
    expect(r.text).not.toContain("@");
    expect(r.text).toContain("[email removed]");
    expect(r.found).toContain("email");
  });
});

describe("stripPiiPatterns — SG NRIC/FIN", () => {
  it("strips classic S/T/F/G series", () => {
    expect(stripPiiPatterns("NRIC S1234567A on file").text).toContain("[ID removed]");
    expect(stripPiiPatterns("FIN G7654321X").text).toContain("[ID removed]");
  });

  it("strips M-prefix FINs (issued since 2022) — advisor-2 F1 vector", () => {
    const r = stripPiiPatterns("FIN M1234567X");
    expect(r.text).toContain("[ID removed]");
    expect(r.found).toContain("national_id");
  });
});

describe("stripPiiPatterns — HKID", () => {
  it("strips with and without parentheses", () => {
    expect(stripPiiPatterns("HKID AB123456(7)").text).toContain("[ID removed]");
    expect(stripPiiPatterns("HKID K123456(3)").text).toContain("[ID removed]");
  });

  it("strips letter-A check digit — advisor-2 F1 vector", () => {
    expect(stripPiiPatterns("HKID AB123456(A)").text).toContain("[ID removed]");
  });

  it("leaves longer digit runs alone (no partial match inside a token)", () => {
    expect(stripPiiPatterns("ref A1234567890").text).toBe("ref A1234567890");
  });
});

describe("stripPiiPatterns — phones", () => {
  it("strips +852 / +65 international formats", () => {
    expect(stripPiiPatterns("Call +852 9123 4567 anytime").text).toContain("[phone removed]");
    expect(stripPiiPatterns("Call +65 8123-4567").text).toContain("[phone removed]");
  });

  it("strips local 8-digit HK/SG numbers", () => {
    const r = stripPiiPatterns("Mobile: 9123 4567");
    expect(r.text).toContain("[phone removed]");
    expect(r.found).toContain("phone");
  });

  it("does NOT strip year ranges — '2021 - 2024' and '2021-2024' stay intact", () => {
    expect(stripPiiPatterns("Acme Pay (2021 - 2024)").text).toBe("Acme Pay (2021 - 2024)");
    expect(stripPiiPatterns("Acme Pay 2021-2024").text).toBe("Acme Pay 2021-2024");
    expect(stripPiiPatterns("from 1998 2004 onwards").text).toBe("from 1998 2004 onwards");
  });

  it("does not strip salaries or plain years", () => {
    expect(stripPiiPatterns("Salary SGD 180000, since 2019").text).toBe(
      "Salary SGD 180000, since 2019",
    );
  });
});

describe("stripPiiPatterns — clean text", () => {
  it("returns text unchanged with no categories", () => {
    const input = "Rust systems engineer: async runtimes, tokio, observability.";
    const r = stripPiiPatterns(input);
    expect(r.text).toBe(input);
    expect(r.found).toHaveLength(0);
  });
});

describe("describePiiCategories", () => {
  it("renders human copy for the preview warning", () => {
    expect(describePiiCategories(["email", "phone"])).toBe("email addresses, phone numbers");
  });
});
