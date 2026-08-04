import { describe, expect, it } from "vitest";

describe("stripPdfMetadata (best-effort metadata strip)", () => {
  it("returns original bytes on parse failure (best-effort contract)", async () => {
    const { stripPdfMetadata } = await import("@/lib/pdf-metadata");
    const broken = new Uint8Array([1, 2, 3]);
    const result = await stripPdfMetadata(broken);
    expect(result).toBe(broken);
  });

  it("strips metadata from a minimal valid PDF", async () => {
    const { stripPdfMetadata } = await import("@/lib/pdf-metadata");
    const encoder = new TextEncoder();
    const minimalPdf = encoder.encode(
      "%PDF-1.4\n" +
        "1 0 obj<</Type/Catalog/Pages 2 0 R/Metadata 4 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n" +
        "4 0 obj<</Type/Metadata/Subtype/XML/Length 0>>stream\n\nendstream\nendobj\n" +
        "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000062 00000 n \n" +
        "0000000119 00000 n \n0000000176 00000 n \ntrailer<</Size 5/Root 1 0 R>>\n%%EOF",
    );
    const result = await stripPdfMetadata(minimalPdf);
    // Should still produce valid PDF bytes, stripped of author/creator/metadata ref
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).not.toBe(minimalPdf.length); // metadata stripped
  });
});
