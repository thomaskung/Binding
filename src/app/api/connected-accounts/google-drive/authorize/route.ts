import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { GDRIVE_OAUTH_STATE_COOKIE, buildAuthUrl, loadGoogleDriveConfig } from "@/lib/google-drive";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Step 1 of the Drive connect flow (DESIGN.md §14a, Phase 4): redirects to
 * Google's OAuth consent screen. Requires the connected-accounts consent to
 * already be granted (toggled on /seeker/profile) — this route only STARTS
 * the OAuth dance, it doesn't collect consent itself.
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { data: consent } = await supabase
    .from("consent_flags")
    .select("connected_accounts_opt_in_at")
    .eq("profile_id", session.userId)
    .maybeSingle();
  if (!consent?.connected_accounts_opt_in_at) {
    return NextResponse.redirect(new URL("/seeker/profile", request.url));
  }

  try {
    const config = loadGoogleDriveConfig();
    const state = randomUUID();
    const response = NextResponse.redirect(buildAuthUrl(config, state));
    response.cookies.set(GDRIVE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — plenty for a consent-screen round trip
      path: "/",
    });
    return response;
  } catch (e) {
    // GOOGLE_DRIVE_CLIENT_ID/SECRET/REDIRECT_URI not configured (e.g. local
    // dev, CI) — fail visibly rather than redirect somewhere confusing.
    const message = e instanceof Error ? e.message : "Google Drive is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
