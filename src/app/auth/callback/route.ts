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
  // `error`/`error_description` instead of `code` — forward the description
  // to /login so it can show something useful via friendlyOAuthError.
  // Magic-link failures never carry these params, so `?error=auth` alone
  // (the existing, untouched behavior) is unaffected.
  const params = new URLSearchParams({ error: "auth" });
  const description = searchParams.get("error_description") ?? searchParams.get("error");
  if (description) params.set("message", description);
  return NextResponse.redirect(`${origin}/login?${params.toString()}`);
}
