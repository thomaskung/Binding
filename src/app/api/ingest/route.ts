import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

/** Resume upload: PDF -> extracted text (returned for the seeker to review as
 * their draft). The raw file is stored owner-only; extraction happens here so
 * the client never needs a PDF parser. Paste-text ingest skips this route. */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session || session.role !== "seeker") {
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
  // storage bucket is private).
  const admin = createSupabaseAdminClient();
  const storagePath = `${session.userId}/${Date.now()}.pdf`;
  await admin.storage.createBucket("resumes", { public: false }).catch(() => {
    /* bucket exists */
  });
  const { error: uploadError } = await admin.storage
    .from("resumes")
    .upload(storagePath, buffer, { contentType: "application/pdf" });
  if (!uploadError) {
    await admin.from("resumes").insert({
      profile_id: session.userId,
      storage_path: storagePath,
      raw_text: text,
    });
  }

  return NextResponse.json({ text });
}
