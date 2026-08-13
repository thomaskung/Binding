import { extractPdfText } from "@/lib/pdf-extract";

/**
 * Google Drive connected-account import (DESIGN.md §14a minimal slice,
 * Phase 4). Lets a seeker pick a résumé-shaped file out of their own Drive
 * and pull its text into the resume draft, as an alternative input method to
 * pasting text or uploading a PDF directly (src/app/api/ingest/route.ts).
 *
 * This is a DATA-ACCESS grant (standing permission to list/read Drive
 * files) — distinct from Phase 3's Supabase-managed *login* OAuth, which is
 * a one-time sign-in with no lasting scope. A standing connection needs a
 * refresh token, which is why `buildAuthUrl` below requests
 * `access_type=offline`+`prompt=consent` (Google only hands back a
 * refresh_token on a consent grant, not on every code exchange).
 *
 * Explicit MVP cuts for this phase (named here, not silently skipped):
 *  - No Picker API. Google's Picker is a separate, heavier JS-widget
 *    integration (its own script include + auth dance); this slice is a
 *    plain "list recent files, pick one from a list" using `files.list`.
 *  - No background token-refresh cron. Refresh is LAZY and on-demand only
 *    (`ensureFreshAccessToken`, called right before a Drive API call) —
 *    there is deliberately no scheduled job keeping tokens warm.
 *  - Drive-only. No generalized multi-provider OAuth abstraction — DESIGN.md
 *    §14a names LinkedIn/GitHub as future connections, but each gets its own
 *    module when it's actually built, not an interface bent to fit three
 *    providers on day one.
 *  - No token encryption-at-rest. `connected_accounts` (migration 0026) is
 *    service-role-only RLS (no authenticated policies) — plaintext tokens in
 *    a table nothing but the service role can read, the same interim
 *    posture `resumes`/`pii_access_log` use today. Flagged as a fast-follow
 *    in that migration's comment, not silently skipped.
 *  - The Google Cloud Console OAuth client stays in "Testing" (unverified)
 *    mode this phase — fine for a handful of test users, but Google's
 *    "unverified app" interstitial shows on every consent screen.
 *    Submitting for verification is a console/ops step for a later phase,
 *    not something this code needs to handle.
 */

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** Cookie name shared between the authorize and callback route handlers —
 * carries the anti-CSRF state token across the redirect to Google and back.
 * Lives here (not exported from a route.ts) because Next.js route segment
 * files may only export the HTTP-verb handlers plus a small fixed set of
 * config options. */
export const GDRIVE_OAUTH_STATE_COOKIE = "gdrive_oauth_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

/** MIME types shown in the plain list-and-pick UI — résumé-shaped documents
 * only. `.docx` is deliberately left out for this slice: there is no docx
 * parser anywhere in this codebase (unlike PDF, which unpdf already
 * handles), and adding one is a bigger lift than a Phase 4 minimal slice
 * warrants. Google Docs native files need no local parser at all — Drive's
 * `export` endpoint converts them to plain text for us. */
export const IMPORTABLE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.google-apps.document",
] as const;

export type ImportableMimeType = (typeof IMPORTABLE_MIME_TYPES)[number];

/** Pure file-filtering predicate — also used to build the `files.list` query
 * string below, so the two never drift apart. */
export function isImportableMimeType(mimeType: string): mimeType is ImportableMimeType {
  return (IMPORTABLE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Cap on how many recent files the plain list-and-pick UI shows. */
export const DRIVE_FILE_LIST_LIMIT = 15;

export interface GoogleDriveOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads the three env vars an unverified-test-mode Google Cloud OAuth
 * client needs (see module doc comment — verification submission is
 * explicitly out of scope this phase). Throws with the missing-var names,
 * matching the AI_PROVIDER=modal config() pattern in src/lib/ai/modal.ts. */
export function loadGoogleDriveConfig(): GoogleDriveOAuthConfig {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Drive connect requires GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REDIRECT_URI",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Builds the Google OAuth consent-screen URL. `access_type=offline` asks for
 * a refresh token; `prompt=consent` forces the consent screen (and a fresh
 * refresh_token) even if this user already granted this scope before —
 * without it, Google silently omits refresh_token on a repeat grant, which
 * would leave a standing connection with no way to renew itself.
 *
 * `state` is an opaque, caller-supplied anti-CSRF token (the route handler
 * generates one and round-trips it via an httpOnly cookie) — this function
 * doesn't generate or validate it, only carries it through.
 */
export function buildAuthUrl(config: GoogleDriveOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface DriveTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO timestamp
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
}

/** Auth code -> access+refresh token (first-time connect, or a re-consent). */
export async function exchangeCodeForTokens(
  config: GoogleDriveOAuthConfig,
  code: string,
): Promise<DriveTokenSet> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const json = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

/** Refresh token -> new access token. Google does not re-issue a refresh
 * token on refresh (the original one stays valid until revoked or unused for
 * ~6 months), so the caller keeps the one it already has stored. */
export async function refreshAccessToken(
  config: GoogleDriveOAuthConfig,
  refreshToken: string,
): Promise<Pick<DriveTokenSet, "accessToken" | "expiresAt">> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
  const json = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

/** Pure — no network. A 60s skew buffer treats a token that's about to
 * expire as already expired, so a lazy-refresh caller doesn't race a real
 * 401 from Google (clock drift + request latency). `now` is injectable for
 * tests. */
export function isTokenExpired(expiresAt: string, now: Date = new Date()): boolean {
  const skewMs = 60_000;
  return new Date(expiresAt).getTime() - skewMs <= now.getTime();
}

export interface StoredDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

/**
 * Lazy on-demand refresh — explicit MVP cut: no background cron keeps
 * tokens warm (see module doc comment). Call this immediately before a
 * Drive API call; if the stored token is expired (or about to be), it's
 * refreshed via Google and the fresh token is returned. This function does
 * no database I/O — the caller (a route handler with the admin client) is
 * responsible for persisting a `refreshed` token back to
 * `connected_accounts`, this module has no notion of storage.
 */
export async function ensureFreshAccessToken(
  config: GoogleDriveOAuthConfig,
  tokens: StoredDriveTokens,
  now: Date = new Date(),
): Promise<{ accessToken: string; expiresAt: string; refreshed: boolean }> {
  if (!isTokenExpired(tokens.expiresAt, now)) {
    return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, refreshed: false };
  }
  const fresh = await refreshAccessToken(config, tokens.refreshToken);
  return { ...fresh, refreshed: true };
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

interface GoogleFilesListResponse {
  files?: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>;
}

/** `files.list` filtered to résumé-shaped mime types (via `isImportableMimeType`'s
 * predicate list), newest-modified first, capped at DRIVE_FILE_LIST_LIMIT.
 * This is the whole "list recent files" surface — a plain list-and-pick, not
 * the Picker API (see module doc comment). */
export async function listRecentFiles(accessToken: string): Promise<DriveFile[]> {
  const mimeFilter = IMPORTABLE_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ");
  const params = new URLSearchParams({
    q: `(${mimeFilter}) and trashed=false`,
    orderBy: "modifiedTime desc",
    pageSize: String(DRIVE_FILE_LIST_LIMIT),
    fields: "files(id,name,mimeType,modifiedTime)",
  });
  const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive files.list failed: ${res.status}`);
  const json = (await res.json()) as GoogleFilesListResponse;
  return json.files ?? [];
}

const MAX_DRIVE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — matches api/ingest's direct-upload cap

/**
 * Fetches the text of ONE selected file. PDFs reuse the SAME extraction path
 * as the direct resume-upload route (src/lib/pdf-extract.ts) — one
 * implementation, not a second parser for the Drive path. Google Docs native
 * files are exported as plain text via Drive's `export` endpoint (Drive does
 * the conversion; no local parser needed).
 */
export async function fetchFileText(
  accessToken: string,
  file: { id: string; mimeType: string },
): Promise<string> {
  if (file.mimeType === "application/vnd.google-apps.document") {
    const params = new URLSearchParams({ mimeType: "text/plain" });
    const res = await fetch(`${FILES_ENDPOINT}/${file.id}/export?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive export failed: ${res.status}`);
    return (await res.text()).trim();
  }
  if (file.mimeType === "application/pdf") {
    const res = await fetch(`${FILES_ENDPOINT}/${file.id}?alt=media`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive file download failed: ${res.status}`);
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength > MAX_DRIVE_FILE_BYTES) {
      throw new Error("Drive PDF too large (max 5MB)");
    }
    return extractPdfText(buffer);
  }
  throw new Error(`Unsupported file type for import: ${file.mimeType}`);
}
