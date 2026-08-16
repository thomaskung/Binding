import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleGroundingText, config, normalizeBraveResults, searchCompanyInfo, type WebSearchResult } from "@/lib/web-search";
import { assertCompanyIdentifier } from "@/lib/ai/types";

describe("assembleGroundingText", () => {
  it("joins title/snippet/url blocks for each result", () => {
    const results: WebSearchResult[] = [
      { title: "Acme Corp Reviews", snippet: "4.2 stars, great culture", url: "https://example.com/reviews" },
      { title: "Acme Corp raises Series B", snippet: "Funding news", url: "https://example.com/news" },
    ];
    const text = assembleGroundingText(results);
    expect(text).toContain("Acme Corp Reviews");
    expect(text).toContain("4.2 stars, great culture");
    expect(text).toContain("https://example.com/reviews");
    expect(text).toContain("Acme Corp raises Series B");
  });

  it("returns an empty string for zero results", () => {
    expect(assembleGroundingText([])).toBe("");
  });

  it("caps total length so the Modal prompt stays bounded", () => {
    const huge: WebSearchResult[] = Array.from({ length: 50 }, (_, i) => ({
      title: `Result ${i}`,
      snippet: "x".repeat(200),
      url: `https://example.com/${i}`,
    }));
    const text = assembleGroundingText(huge);
    expect(text.length).toBeLessThanOrEqual(4000);
  });
});

describe("normalizeBraveResults — defensive against a malformed/unexpected response", () => {
  it("extracts title/description/url from a well-formed Brave response", () => {
    const raw = { web: { results: [{ title: "Acme", description: "A company", url: "https://acme.example" }] } };
    expect(normalizeBraveResults(raw)).toEqual([{ title: "Acme", snippet: "A company", url: "https://acme.example" }]);
  });

  it("drops an entry missing a title or url rather than keeping a blank half", () => {
    const raw = { web: { results: [{ description: "no title or url" }, { title: "Has URL", url: "https://x.example" }] } };
    expect(normalizeBraveResults(raw)).toEqual([{ title: "Has URL", snippet: "", url: "https://x.example" }]);
  });

  it("degrades to an empty list for a completely unexpected shape (e.g. a live-account surprise)", () => {
    expect(normalizeBraveResults(null)).toEqual([]);
    expect(normalizeBraveResults({})).toEqual([]);
    expect(normalizeBraveResults({ web: {} })).toEqual([]);
    expect(normalizeBraveResults("not even an object")).toEqual([]);
  });
});

describe("config — WEB_SEARCH_API_KEY", () => {
  const original = process.env.WEB_SEARCH_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = original;
  });

  it("throws a clear error when the key is missing", () => {
    delete process.env.WEB_SEARCH_API_KEY;
    expect(() => config()).toThrow(/WEB_SEARCH_API_KEY/);
  });

  it("returns the key when present", () => {
    process.env.WEB_SEARCH_API_KEY = "test-key";
    expect(config()).toEqual({ apiKey: "test-key" });
  });
});

describe("searchCompanyInfo — network-mocked", () => {
  const company = assertCompanyIdentifier("Acme Corp");

  beforeEach(() => {
    process.env.WEB_SEARCH_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WEB_SEARCH_API_KEY;
  });

  it("fetches, normalizes, and assembles grounding text on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [{ title: "Acme Reviews", description: "great culture", url: "https://x.example" }] } }),
    });
    const text = await searchCompanyInfo(company);
    expect(text).toContain("Acme Reviews");
    expect(text).toContain("great culture");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const [url, init] = call as [string, RequestInit];
    expect(url).toContain("api.search.brave.com");
    expect((init.headers as Record<string, string>)["x-subscription-token"]).toBe("test-key");
  });

  it("throws on a non-ok response rather than returning empty/fabricated text", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(searchCompanyInfo(company)).rejects.toThrow(/429/);
  });
});
