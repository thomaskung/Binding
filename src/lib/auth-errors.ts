/**
 * Maps a Supabase Auth error to user-facing copy for OAuth sign-in.
 *
 * Why this needs to exist at all: `supabase-js`'s `signInWithOAuth()` builds
 * the `/authorize` URL entirely client-side and always resolves with
 * `error: null` (see `_handleProviderSignIn`/`_getUrlForProvider` in
 * `@supabase/auth-js`) — GoTrue only discovers a provider is disabled or
 * misconfigured once the browser actually requests `/authorize`, and at that
 * point it returns a bare JSON error instead of redirecting back to the app
 * (`ExternalProviderRedirect` in supabase/auth's `internal/api/external.go`
 * short-circuits before the `http.Redirect` call). So callers here
 * (`login-form.tsx`) pre-check GoTrue's public `/auth/v1/settings` endpoint
 * and, on the "not enabled" case, construct an error to run through this
 * mapper rather than ever letting the raw GoTrue error reach the user.
 *
 * The known "not configured" strings below come straight from
 * `OAuthProviderConfiguration.ValidateOAuth()` in supabase/auth's
 * `internal/conf/configuration.go` (wrapped by `internal/api/external.go`'s
 * `Provider()` as `"Unsupported provider: <reason>"`):
 *   - "provider is not enabled"
 *   - "missing OAuth client ID"
 *   - "missing OAuth secret"
 *   - "missing redirect URI"
 *
 * Anything else (network errors, rate limits, real provider failures) is
 * passed through verbatim — this must never swallow a real error.
 */

const NOT_CONFIGURED_PATTERNS: RegExp[] = [
  /provider is not enabled/i,
  /missing oauth client id/i,
  /missing oauth secret/i,
  /missing redirect uri/i,
  /unsupported provider/i,
];

const NOT_CONFIGURED_MESSAGE =
  "Google sign-in isn't set up here yet — continue with your work email instead.";

const GENERIC_FALLBACK_MESSAGE = "Something went wrong signing in. Please try again.";

export function friendlyOAuthError(error: unknown): string {
  const message = extractMessage(error);
  if (message && NOT_CONFIGURED_PATTERNS.some((pattern) => pattern.test(message))) {
    return NOT_CONFIGURED_MESSAGE;
  }
  return message || GENERIC_FALLBACK_MESSAGE;
}

/** Pulls a human-readable message out of the shapes we actually see:
 * a plain string, an `Error`/`AuthError` (`.message`), or GoTrue's raw REST
 * error bodies (`{ msg }` from most endpoints, `{ error, error_description }`
 * from the OAuth-flavored ones). */
function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
    if (typeof candidate.msg === "string" && candidate.msg) return candidate.msg;
    if (typeof candidate.error_description === "string" && candidate.error_description) {
      return candidate.error_description;
    }
    if (typeof candidate.error === "string" && candidate.error) return candidate.error;
  }
  return "";
}
