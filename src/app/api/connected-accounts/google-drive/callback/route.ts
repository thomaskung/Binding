import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import {
  GDRIVE_OAUTH_STATE_COOKIE,
  GOOGLE_DRIVE_SCOPE,
  exchangeCodeForTokens,
  loadGoogleDriveConfig,
} from "@/lib/google-drive";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Step 2 of the Drive connect flow: Google redirects here with
 * `?code&state` (or `?error=...` if the user declined). Exchanges the code
 * for tokens and upserts `connected_accounts` (migration 0026) via the
 * admin/service-role client — that table has no authenticated RLS policy,
 * so only the admin client can write to it.
 *
 * Always redirects back to the resume canvas (no query params on our own
 * side, per the app's path-segment-only routing rule — `code`/`state` are
 * Google's protocol, not ours) and never leaks OAuth error detail into the
 * URL; the page just re-reads connection status from the database.
 */
export async function GET(request: Request) {
  const resumeUrl = new URL("/seeker/profile/resume", request.url);

  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GDRIVE_OAUTH_STATE_COOKIE)?.value;

  const response = NextResponse.redirect(resumeUrl);
  response.cookies.delete(GDRIVE_OAUTH_STATE_COOKIE);

  if (oauthError || !code || !state || state !== expectedState) {
    // Declined consent, or a CSRF/replay mismatch — fail closed, never write
    // a partial connection.
    return response;
  }

  try {
    const config = loadGoogleDriveConfig();
    const tokens = await exchangeCodeForTokens(config, code);
    if (!tokens.refreshToken) {
      // Should not happen with access_type=offline+prompt=consent, but
      // Google can omit refresh_token in edge cases — fail closed rather
      // than store a connection that can never refresh itself.
      return response;
    }
    const admin = createSupabaseAdminClient();
    await admin.from("connected_accounts").upsert(
      {
        profile_id: session.userId,
        provider: "google_drive",
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        scope: GOOGLE_DRIVE_SCOPE,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,provider" },
    );
  } catch {
    // Token exchange or DB write failed — fail closed silently; the resume
    // page simply shows "not connected" and the seeker can retry.
  }

  return response;
}
