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
