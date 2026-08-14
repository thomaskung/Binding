import { NextResponse } from "next/server";
import { REFERRAL_COOKIE_MAX_AGE_SECONDS, REFERRAL_COOKIE_NAME } from "@/lib/referrals";

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
 * only stashes the code, it never touches the `referrals` table or looks
 * the code up at all.
 *
 * Doesn't leak code validity: the code is stashed unconditionally — an
 * earlier version looked the code up here and only set the cookie when
 * valid, which made Set-Cookie's presence/absence an oracle for enumerating
 * real codes. Validity is checked exactly once, downstream, at capture time
 * (`captureAndEarnReferral`'s own lookup, which already no-ops on an unknown
 * code) — this route can't distinguish the two cases at all, so there's
 * nothing to leak.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const response = NextResponse.redirect(new URL("/signup", request.url));
  response.cookies.set(REFERRAL_COOKIE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
