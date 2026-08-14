import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  resolveReferrerByCode,
} from "@/lib/referrals";

/**
 * Redeem-landing endpoint for a referral invite link (DESIGN.md §13g).
 * A route handler, NOT `page.tsx`: Next.js only allows cookie *mutation* in
 * Server Actions and Route Handlers, never in a plain Server Component
 * render — same reason `/api/connected-accounts/google-drive/authorize`
 * is a route handler rather than a page.
 *
 * No query params (founder's path-segment-only routing rule): the code
 * survives the redirect to `/signup` via a short-lived httpOnly cookie
 * instead of a `?ref=` param. It's consumed exactly once, server-side, at
 * whichever role the new account first activates
 * (`captureAndEarnReferral` in src/app/onboarding/actions.ts) — this route
 * only stashes the code, it never touches the `referrals` table itself.
 *
 * Doesn't leak code validity: an invalid/unknown code redirects to
 * `/signup` exactly like a valid one (same status, same Location, no error
 * surfaced) — this route can't be used as an oracle to enumerate whether a
 * given code exists.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const response = NextResponse.redirect(new URL("/signup", request.url));

  const admin = createSupabaseAdminClient();
  const referrerId = await resolveReferrerByCode(admin, code).catch(() => null);
  if (referrerId) {
    response.cookies.set(REFERRAL_COOKIE_NAME, code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }
  return response;
}
