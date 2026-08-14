import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { ensureFreshAccessToken, listRecentFiles, loadGoogleDriveConfig } from "@/lib/google-drive";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Lists the signed-in seeker's own connected Drive account's recent
 * résumé-shaped files (plain list-and-pick, not the Picker API — see
 * src/lib/google-drive.ts's module doc comment). Refreshes the access token
 * lazily, only when it's expired — no background cron keeps it warm
 * (explicit MVP cut, same file).
 */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.json({ error: "seeker session required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  // Defense in depth: withdrawing consent (updateConnectedAccountsConsent)
  // deletes the connected_accounts row, which the !account check below
  // already catches — but this checks the consent flag itself too, so a
  // future code path that creates a row without going through that action
  // can't silently keep this endpoint serving real Drive data after consent
  // was withdrawn.
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
    const files = await listRecentFiles(fresh.accessToken);
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive request failed" },
      { status: 502 },
    );
  }
}
