import { describe, expect, it, vi } from "vitest";
import {
  DRIVE_FILE_LIST_LIMIT,
  GOOGLE_DRIVE_SCOPE,
  IMPORTABLE_MIME_TYPES,
  buildAuthUrl,
  ensureFreshAccessToken,
  exchangeCodeForTokens,
  fetchFileText,
  isImportableMimeType,
  isTokenExpired,
  listRecentFiles,
  loadGoogleDriveConfig,
  refreshAccessToken,
} from "@/lib/google-drive";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://app.example.com/api/connected-accounts/google-drive/callback",
};

describe("buildAuthUrl", () => {
  it("points at Google's consent endpoint with the required data-access params", () => {
    const url = new URL(buildAuthUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_DRIVE_SCOPE);
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("requests access_type=offline + prompt=consent — a standing DATA-ACCESS grant, not a one-time login", () => {
    const url = new URL(buildAuthUrl(config, "s"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("carries an arbitrary state token through untouched", () => {
    const url = new URL(buildAuthUrl(config, "another-nonce-value"));
    expect(url.searchParams.get("state")).toBe("another-nonce-value");
  });
});

describe("loadGoogleDriveConfig", () => {
  it("throws naming the missing env vars when unconfigured", () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_DRIVE_REDIRECT_URI", "");
    expect(() => loadGoogleDriveConfig()).toThrow(/GOOGLE_DRIVE_CLIENT_ID/);
    vi.unstubAllEnvs();
  });

  it("returns the config when all three vars are set", () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_DRIVE_REDIRECT_URI", "https://example.com/callback");
    expect(loadGoogleDriveConfig()).toEqual({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://example.com/callback",
    });
    vi.unstubAllEnvs();
  });
});

describe("isImportableMimeType — file filtering", () => {
  it("accepts PDF and native Google Docs", () => {
    expect(isImportableMimeType("application/pdf")).toBe(true);
    expect(isImportableMimeType("application/vnd.google-apps.document")).toBe(true);
  });

  it("rejects everything else, including .docx (no parser for it in this codebase)", () => {
    expect(
      isImportableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
    expect(isImportableMimeType("image/png")).toBe(false);
    expect(isImportableMimeType("application/vnd.google-apps.spreadsheet")).toBe(false);
    expect(isImportableMimeType("")).toBe(false);
  });

  it("IMPORTABLE_MIME_TYPES stays a small, explicit allowlist", () => {
    expect(IMPORTABLE_MIME_TYPES).toEqual(["application/pdf", "application/vnd.google-apps.document"]);
  });
});

describe("isTokenExpired — pure, no network", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("is not expired well before expiry", () => {
    expect(isTokenExpired("2026-08-13T13:00:00.000Z", now)).toBe(false);
  });

  it("is expired once the timestamp has passed", () => {
    expect(isTokenExpired("2026-08-13T11:00:00.000Z", now)).toBe(true);
  });

  it("treats a token expiring within the 60s skew buffer as already expired", () => {
    expect(isTokenExpired("2026-08-13T12:00:30.000Z", now)).toBe(true);
  });

  it("treats a token expiring just outside the skew buffer as still valid", () => {
    expect(isTokenExpired("2026-08-13T12:01:01.000Z", now)).toBe(false);
  });
});

function mockFetchOnce(status: number, body: unknown, isText = false) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body as string),
    arrayBuffer: () => Promise.resolve(body as ArrayBuffer),
  });
  void isText;
}

describe("exchangeCodeForTokens / refreshAccessToken — network-mocked", () => {
  it("exchanges a code for an access+refresh token pair", async () => {
    mockFetchOnce(200, {
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 3600,
      token_type: "Bearer",
      scope: GOOGLE_DRIVE_SCOPE,
    });
    const tokens = await exchangeCodeForTokens(config, "auth-code");
    expect(tokens.accessToken).toBe("at-1");
    expect(tokens.refreshToken).toBe("rt-1");
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("refreshes without expecting a new refresh_token back", async () => {
    mockFetchOnce(200, { access_token: "at-2", expires_in: 3600, token_type: "Bearer", scope: GOOGLE_DRIVE_SCOPE });
    const refreshed = await refreshAccessToken(config, "rt-1");
    expect(refreshed.accessToken).toBe("at-2");
  });

  it("throws on a non-2xx token response", async () => {
    mockFetchOnce(400, { error: "invalid_grant" });
    await expect(exchangeCodeForTokens(config, "bad-code")).rejects.toThrow("Google token exchange failed");
    await expect(refreshAccessToken(config, "bad-refresh")).rejects.toThrow("Google token refresh failed");
  });
});

describe("ensureFreshAccessToken — lazy on-demand refresh, no cron", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("returns the stored token unchanged when it is not yet expired", async () => {
    const result = await ensureFreshAccessToken(
      config,
      { accessToken: "at-old", refreshToken: "rt", expiresAt: "2026-08-13T13:00:00.000Z" },
      now,
    );
    expect(result).toEqual({ accessToken: "at-old", expiresAt: "2026-08-13T13:00:00.000Z", refreshed: false });
  });

  it("refreshes via Google when the stored token is expired, and reports refreshed:true", async () => {
    mockFetchOnce(200, { access_token: "at-new", expires_in: 3600, token_type: "Bearer", scope: GOOGLE_DRIVE_SCOPE });
    const result = await ensureFreshAccessToken(
      config,
      { accessToken: "at-old", refreshToken: "rt", expiresAt: "2026-08-13T11:00:00.000Z" },
      now,
    );
    expect(result.accessToken).toBe("at-new");
    expect(result.refreshed).toBe(true);
  });
});

describe("listRecentFiles — network-mocked", () => {
  it("requests files.list with the mime filter, cap, and bearer token", async () => {
    mockFetchOnce(200, {
      files: [{ id: "f1", name: "Resume.pdf", mimeType: "application/pdf", modifiedTime: "2026-08-01T00:00:00Z" }],
    });
    const files = await listRecentFiles("at-1");
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("Resume.pdf");

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const [url, init] = call as [string, RequestInit];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("mimeType='application/pdf'");
    expect(decoded).toContain("mimeType='application/vnd.google-apps.document'");
    expect(decoded).toContain(`pageSize=${DRIVE_FILE_LIST_LIMIT}`);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer at-1");
  });

  it("throws on a non-2xx response", async () => {
    mockFetchOnce(401, { error: "invalid credentials" });
    await expect(listRecentFiles("expired-token")).rejects.toThrow("Drive files.list failed: 401");
  });
});

describe("fetchFileText — network-mocked, reuses extractPdfText for PDFs", () => {
  it("exports native Google Docs as plain text via Drive's export endpoint", async () => {
    mockFetchOnce(200, "plain text content");
    const text = await fetchFileText("at-1", { id: "doc1", mimeType: "application/vnd.google-apps.document" });
    expect(text).toBe("plain text content");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0] as string).toContain("/doc1/export?mimeType=text%2Fplain");
  });

  it("rejects an unsupported mime type without making a network call", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    await expect(fetchFileText("at-1", { id: "x", mimeType: "image/png" })).rejects.toThrow(
      "Unsupported file type",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
