import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Magic-link + OAuth redirect target: exchanges the auth code for a
 * session. Provider-agnostic — `exchangeCodeForSession` works the same
 * whether `code` came from a magic-link click or a Google consent redirect,
 * so no per-provider branching is needed here. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Landing-CTA intent survives the magic-link/OAuth round-trip via ?next=.
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // A failed OAuth leg (e.g. Google denies consent, or GoTrue's
  // account-linking check rejects the identity) redirects here with
  // `error`/`error_description` instead of `code`. This route is a public,
  // unauthenticated GET endpoint — anyone can hit it directly with an
  // arbitrary `error_description`, so that value must NEVER be reflected
  // onto /login verbatim (that would let an attacker craft a link that
  // displays attacker-chosen text as an "error" on the real login page —
  // a phishing/spoofing vector, not just a cosmetic one, even though React
  // escaping rules out classic XSS here). Instead, collapse to a fixed
  // `error=oauth` marker with no free text; /login maps that single known
  // code to one fixed, safe message. Magic-link failures never carry these
  // params, so `?error=auth` alone (the existing, untouched behavior) is
  // unaffected.
  const isOAuthFailure = searchParams.has("error") || searchParams.has("error_description");
  const errorCode = isOAuthFailure ? "oauth" : "auth";
  return NextResponse.redirect(`${origin}/login?error=${errorCode}`);
}
