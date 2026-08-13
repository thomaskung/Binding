import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { ensureFreshAccessToken, fetchFileText, isImportableMimeType, loadGoogleDriveConfig } from "@/lib/google-drive";
import { stripPiiPatterns } from "@/lib/pii-patterns";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface ImportBody {
  fileId?: string;
  mimeType?: string;
}

/**
 * Fetches ONE Drive file's text (picked from the /files list above) and
 * hands it back as draft text — same "review before publish" contract as
 * /api/ingest (direct PDF upload): a Layer-0 PII-pattern strip on the way
 * back to the client, ahead of the LLM redaction pass that runs at publish.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.json({ error: "seeker session required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ImportBody | null;
  if (!body?.fileId || !body?.mimeType) {
    return NextResponse.json({ error: "fileId and mimeType required" }, { status: 400 });
  }
  if (!isImportableMimeType(body.mimeType)) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 415 });
  }

  const admin = createSupabaseAdminClient();
  // Defense in depth — see the matching check in files/route.ts's comment:
  // withdrawing consent deletes the connected_accounts row, but this checks
  // the consent flag itself too so a stray row can't keep this endpoint
  // extracting real Drive file text after consent was withdrawn.
  const { data: consent } = await admin
    .from("consent_flags")
    .select("connected_accounts_opt_in_at")
    .eq("profile_id", session.userId)
    .maybeSingle();
  if (!consent?.connected_accounts_opt_in_at) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 404 });
  }

  const { data: account } = await admin
    .from("connected_accounts")
    .select("access_token, refresh_token, expires_at")
    .eq("profile_id", session.userId)
    .eq("provider", "google_drive")
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 404 });
  }

  try {
    const config = loadGoogleDriveConfig();
    const fresh = await ensureFreshAccessToken(config, {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
    });
    if (fresh.refreshed) {
      await admin
        .from("connected_accounts")
        .update({
          access_token: fresh.accessToken,
          expires_at: fresh.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", session.userId)
        .eq("provider", "google_drive");
    }
    const text = await fetchFileText(fresh.accessToken, { id: body.fileId, mimeType: body.mimeType });
    if (!text) {
      return NextResponse.json(
        { error: "no extractable text in that file — paste your resume text instead" },
        { status: 422 },
      );
    }
    const { text: draftText, found } = stripPiiPatterns(text);
    return NextResponse.json({ text: draftText, piiFound: found });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive import failed" },
      { status: 502 },
    );
  }
}
