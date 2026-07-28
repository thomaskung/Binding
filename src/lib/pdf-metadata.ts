import { PDFDocument, PDFName } from "pdf-lib";

/**
 * Server-side PDF metadata strip at ingest (DESIGN.md §2f Layer 0/1
 * boundary): resume files routinely carry the author's full name and
 * organisation in metadata that no text-redaction pass ever sees. Clears the
 * Info-dictionary fields AND drops the XMP metadata stream (which duplicates
 * author/creator — clearing only Info would leave the same PII behind,
 * advisor-2 F6). Runs before the raw file is stored.
 *
 * Best-effort: on any parse/re-save failure the ORIGINAL bytes are returned
 * (the file already passed unpdf extraction, so failures here are rare
 * pdf-lib quirks) — storage is owner-only either way; the strip narrows the
 * blast radius of a leak, it is not the access control.
 */
export async function stripPdfMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setProducer("");
    doc.setCreator("");
    // XMP packet lives at catalog /Metadata — remove the reference entirely.
    doc.catalog.delete(PDFName.of("Metadata"));
    return await doc.save();
  } catch {
    return bytes;
  }
}
