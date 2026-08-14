import { extractText, getDocumentProxy } from "unpdf";

/**
 * Shared PDF -> text extraction. Used by BOTH the direct resume-upload path
 * (src/app/api/ingest/route.ts) and the Google Drive file-import path
 * (src/lib/google-drive.ts, Phase 4 DESIGN.md §14a) — one extraction
 * implementation, not a second parser bolted onto the Drive import.
 *
 * Throws if the bytes aren't a parseable PDF at all. Returns "" (does NOT
 * throw) when parsing succeeds but no text is found (e.g. a scanned PDF with
 * no text layer) — callers give their own source-specific guidance for that
 * case ("paste your resume text instead" for direct upload, similar for
 * Drive import).
 */
export async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buffer);
  const extracted = await extractText(pdf, { mergePages: true });
  return extracted.text.trim();
}
