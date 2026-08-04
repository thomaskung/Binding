import { describe, expect, it } from "vitest";
import { redactKnownIdentifiers } from "@/lib/redact-known";

describe("redactKnownIdentifiers (G1 hybrid redaction)", () => {
  const known = {
    names: ["KUNG Siu Kei, Thomas"],
    organizations: [
      "Rakkar Digital Pte Ltd",
      "Crypto.com",
      "Protiviti Hong Kong Co., Limited",
      "Macroview Telecom Limited",
      "PCCW Global Limited Satellite Service",
      "T&S Quantum Limited",
    ],
  };

  it("strips the full name and its component tokens", () => {
    const { text, removed } = redactKnownIdentifiers(
      "KUNG Siu Kei, Thomas is a CISO. Thomas led security. Contact Kung directly.",
      known,
    );
    expect(removed.names).toBe(true);
    expect(text).not.toMatch(/KUNG/i);
    expect(text).not.toMatch(/\bThomas\b/i);
    expect(text).toMatch(/\[name removed\]/);
  });

  it("strips employer names including those with corporate suffixes", () => {
    const { text, removed } = redactKnownIdentifiers(
      "Led security at Rakkar Digital Pte Ltd, previously Head of Risk at Crypto.com and a consultant at Protiviti Hong Kong Co., Limited.",
      known,
    );
    expect(removed.organizations).toBe(true);
    expect(text).not.toMatch(/Rakkar/i);
    expect(text).not.toMatch(/Crypto\.com/i);
    expect(text).not.toMatch(/Protiviti/i);
    expect(text).toMatch(/\[former employer\]/);
  });

  it("strips a distinctive employer token even when it appears STANDALONE", () => {
    // The founder-test gap: the phrase "Protiviti Hong Kong" is matched, but a
    // standalone "at Protiviti as a consultant" was leaking.
    const { text } = redactKnownIdentifiers(
      "Senior Consultant at Protiviti; earlier a NOC Engineer at PCCW; and at Macroview before that.",
      known,
    );
    expect(text).not.toMatch(/Protiviti/i);
    expect(text).not.toMatch(/PCCW/i);
    expect(text).not.toMatch(/Macroview/i);
  });

  it("does NOT over-redact generic org/geographic words", () => {
    // "Hong Kong" / "Digital" / "Limited" must survive as ordinary content.
    const { text } = redactKnownIdentifiers(
      "Based in Hong Kong, works on digital payments for a limited set of banking clients.",
      known,
    );
    expect(text).toMatch(/Hong Kong/);
    expect(text).toMatch(/digital/);
    expect(text).toMatch(/banking/);
  });

  it("strips an obvious HK street-address span", () => {
    const { text, removed } = redactKnownIdentifiers(
      "Address: Flat B, 10/F, Tower 2, Island Harbourview, 11 Hoi Fai Road, Tai Kok Tsui, Kowloon, Hong Kong. Skills: security.",
      known,
    );
    expect(removed.address).toBe(true);
    expect(text).not.toMatch(/Hoi Fai Road/i);
    expect(text).toMatch(/\[address removed\]/);
    expect(text).toMatch(/Skills: security/); // non-address content preserved
  });

  it("is idempotent and leaves unrelated text untouched", () => {
    const input = "Senior security leader with cloud and compliance experience.";
    const once = redactKnownIdentifiers(input, known);
    const twice = redactKnownIdentifiers(once.text, known);
    expect(once.text).toBe(input);
    expect(twice.text).toBe(input);
  });
});
