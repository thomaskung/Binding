import { describe, expect, it, vi } from "vitest";

// Mock all Modal env vars so config() doesn't throw
vi.stubEnv("AI_PROVIDER", "modal");
vi.stubEnv("MODAL_REDACT_URL", "https://mock.modal.run/redact");
vi.stubEnv("MODAL_CREDENTIALS_URL", "https://mock.modal.run/credentials");
vi.stubEnv("MODAL_SUMMARY_URL", "https://mock.modal.run/summary");
vi.stubEnv("MODAL_REFINE_URL", "https://mock.modal.run/refine");
vi.stubEnv("MODAL_EMBED_URL", "https://mock.modal.run/embed");
vi.stubEnv("MODAL_EXTRACT_URL", "https://mock.modal.run/extract");
vi.stubEnv("MODAL_API_TOKEN", "mock-token");

const { modalProvider } = await import("@/lib/ai/modal");
const { assertJDTextOnly } = await import("@/lib/ai/types");

function mockFetch(status: number, json: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(json),
  });
}

describe("modal provider — fetch path", () => {
  it("redact returns the model response", async () => {
    mockFetch(200, { redactedText: "redacted resume text" });
    const result = await modalProvider.redact("my resume");
    expect(result.redactedText).toBe("redacted resume text");
  });

  it("embed returns the embedding array", async () => {
    const vec = Array.from({ length: 1024 }, () => 0.1);
    mockFetch(200, { embedding: vec });
    const result = await modalProvider.embed("backend engineer");
    expect(result).toHaveLength(1024);
  });

  it("fitSummary returns the summary", async () => {
    mockFetch(200, { summary: "strong fit" });
    const result = await modalProvider.fitSummary("candidate", "job");
    expect(result).toBe("strong fit");
  });

  it("refineProfile returns the refined text", async () => {
    mockFetch(200, { refined: "improved profile" });
    const result = await modalProvider.refineProfile("original");
    expect(result).toBe("improved profile");
  });

  it("refineJobDescription returns the refined JD", async () => {
    mockFetch(200, { refined: "improved JD" });
    const jd = assertJDTextOnly("job description");
    const result = await modalProvider.refineJobDescription(jd);
    expect(result).toBe("improved JD");
  });

  it("extractProfileFields returns structured fields", async () => {
    const fields = { skills: ["Go"], roles: ["Engineer"], industries: ["Tech"], experience: [] };
    mockFetch(200, fields);
    const result = await modalProvider.extractProfileFields("resume");
    expect(result.skills).toEqual(["Go"]);
  });

  it("generalizeCredentials returns the generalization", async () => {
    mockFetch(200, { refined: "3 certifications" });
    const result = await modalProvider.generalizeCredentials("AWS SA Pro, CKA");
    expect(result).toBe("3 certifications");
  });

  it("draftMaintenanceUpdate returns the draft", async () => {
    mockFetch(200, { refined: "updated profile" });
    const result = await modalProvider.draftMaintenanceUpdate("summary", "answer");
    expect(result).toBe("updated profile");
  });

  it("throws on a non-2xx response", async () => {
    mockFetch(500, { error: "down" });
    await expect(modalProvider.redact("text")).rejects.toThrow("Modal endpoint");
  });
});
