import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getSessionProfile } from "@/lib/auth";
import { stripPdfMetadata } from "@/lib/pdf-metadata";
import { stripPiiPatterns } from "@/lib/pii-patterns";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

/** Resume upload: PDF -> extracted text (returned for the seeker to review as
 * their draft). The raw file is stored owner-only; extraction happens here so
 * the client never needs a PDF parser. Paste-text ingest skips this route. */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.json({ error: "seeker session required" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
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
    const pdf = await getDocumentProxy(buffer);
    const extracted = await extractText(pdf, { mergePages: true });
    text = extracted.text.trim();
  } catch {
    return NextResponse.json({ error: "could not extract text from PDF" }, { status: 422 });
  }
  if (!text) {
    return NextResponse.json(
      { error: "no extractable text (scanned PDF?) — paste your resume text instead" },
      { status: 422 },
    );
  }

  // Store the raw file + text owner-only (RLS: resumes table is owner-only;
  // storage bucket is private). The stored file has its document metadata
  // stripped (Info dict + XMP — author/org fields no redaction pass sees);
  // raw_text stays the FAITHFUL extraction (owner-only DSAR access copy) —
  // pattern-stripping applies only to the returned draft text below.
  const admin = createSupabaseAdminClient();
  const storagePath = `${session.userId}/${Date.now()}.pdf`;
  await admin.storage.createBucket("resumes", { public: false }).catch(() => {
    /* bucket exists */
  });
  const stripped = await stripPdfMetadata(buffer);
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

  // Layer-0 defense-in-depth on the PDF path (DESIGN.md §2f): deterministic
  // contact-identifier strip on the draft text handed back to the client —
  // ahead of the LLM redaction that runs at publish.
  const { text: draftText, found } = stripPiiPatterns(text);
  return NextResponse.json({ text: draftText, piiFound: found });
}
