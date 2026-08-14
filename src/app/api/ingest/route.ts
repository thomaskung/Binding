import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { extractPdfText } from "@/lib/pdf-extract";
import { stripPdfMetadata } from "@/lib/pdf-metadata";
import { stripPiiPatterns } from "@/lib/pii-patterns";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

/** Resume upload: PDF -> extracted text (returned for the seeker to review as
 * their draft). Extraction happens here so the client never needs a PDF
 * parser — plaintext PDF bytes always travel to the server for this one
 * step regardless of encryption mode (there's no way around that: text
 * extraction needs plaintext). Paste-text ingest skips this route.
 *
 * Two persistence modes, chosen by the `encrypt` form field (client sends
 * `"true"` only once it has completed passkey enrollment, DESIGN.md §2g
 * Phase 10):
 * - default (`encrypt` absent/false): unchanged from before Phase 10 — the
 *   route itself stores the metadata-stripped PDF + raw text, plaintext,
 *   owner-only (RLS). This stays the default for any seeker who hasn't
 *   enrolled a passkey — encryption is opt-in, never a hard requirement.
 * - `encrypt=true`: the route does NOT persist anything. It returns the
 *   metadata-stripped PDF bytes and the full raw text back to the client,
 *   which encrypts both under its own unwrapped DEK and persists them via
 *   `storeEncryptedResume` (src/app/(app)/seeker/key-custody-actions.ts).
 *   This is the one "transient decrypt-then-POST" trigger §2g's MVP slice
 *   builds: the server holds plaintext only for the length of this one
 *   request/response, never logs or stores it, and the access is recorded
 *   (not the content) in `decrypt_access_log`.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.json({ error: "seeker session required" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const encrypt = form?.get("encrypt") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF too large (max 5MB)" }, { status: 413 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "only PDF uploads supported (or paste text)" }, { status: 415 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch {
    return NextResponse.json({ error: "could not extract text from PDF" }, { status: 422 });
  }
  if (!text) {
    return NextResponse.json(
      { error: "no extractable text (scanned PDF?) — paste your resume text instead" },
      { status: 422 },
    );
  }

  const admin = createSupabaseAdminClient();
  const stripped = await stripPdfMetadata(buffer);

  // Layer-0 defense-in-depth on the PDF path (DESIGN.md §2f): deterministic
  // contact-identifier strip on the draft text handed back to the client —
  // ahead of the LLM redaction that runs at publish.
  const { text: draftText, found } = stripPiiPatterns(text);

  if (encrypt) {
    await admin.from("decrypt_access_log").insert({ profile_id: session.userId, purpose: "upload_processing" });
    return NextResponse.json({
      text: draftText,
      piiFound: found,
      rawText: text,
      strippedPdfBase64: Buffer.from(stripped).toString("base64"),
    });
  }

  // Store the raw file + text owner-only (RLS: resumes table is owner-only;
  // storage bucket is private). raw_text stays the FAITHFUL extraction
  // (owner-only DSAR access copy) — pattern-stripping applies only to the
  // returned draft text above.
  const storagePath = `${session.userId}/${Date.now()}.pdf`;
  await admin.storage.createBucket("resumes", { public: false }).catch(() => {
    /* bucket exists */
  });
  const { error: uploadError } = await admin.storage
    .from("resumes")
    .upload(storagePath, stripped, { contentType: "application/pdf" });
  if (!uploadError) {
    await admin.from("resumes").insert({
      profile_id: session.userId,
      storage_path: storagePath,
      raw_text: text,
    });
  }

  return NextResponse.json({ text: draftText, piiFound: found });
}
