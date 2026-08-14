import { describe, expect, it } from "vitest";
import { friendlyOAuthError } from "@/lib/auth-errors";

describe("friendlyOAuthError", () => {
  it("maps GoTrue's 'provider is not enabled' error to friendly copy", () => {
    expect(friendlyOAuthError(new Error("provider is not enabled"))).toBe(
      "Google sign-in isn't set up here yet — continue with your work email instead.",
    );
  });

  it("maps the wrapped 'Unsupported provider: ...' variant GoTrue's /authorize actually returns", () => {
    expect(
      friendlyOAuthError({ code: 400, error_code: "validation_failed", msg: "Unsupported provider: provider is not enabled" }),
    ).toBe("Google sign-in isn't set up here yet — continue with your work email instead.");
  });

  it("maps missing-client-id / missing-secret / missing-redirect-uri misconfiguration", () => {
    const expected = "Google sign-in isn't set up here yet — continue with your work email instead.";
    expect(friendlyOAuthError(new Error("missing OAuth client ID"))).toBe(expected);
    expect(friendlyOAuthError(new Error("missing OAuth secret"))).toBe(expected);
    expect(friendlyOAuthError(new Error("missing redirect URI"))).toBe(expected);
  });

  it("is case-insensitive on the not-configured patterns", () => {
    expect(friendlyOAuthError(new Error("PROVIDER IS NOT ENABLED"))).toBe(
      "Google sign-in isn't set up here yet — continue with your work email instead.",
    );
  });

  it("passes through a real, unrelated AuthError message verbatim", () => {
    expect(friendlyOAuthError({ message: "Email link is invalid or has expired" })).toBe(
      "Email link is invalid or has expired",
    );
  });

  it("passes through a plain string error", () => {
    expect(friendlyOAuthError("network request failed")).toBe("network request failed");
  });

  it("reads GoTrue's REST error_description/error fields when message/msg are absent", () => {
    expect(friendlyOAuthError({ error: "access_denied", error_description: "User denied consent" })).toBe(
      "User denied consent",
    );
    expect(friendlyOAuthError({ error: "server_error" })).toBe("server_error");
  });

  it("prefers message over msg over error_description over error, in that order", () => {
    expect(
      friendlyOAuthError({
        message: "from message",
        msg: "from msg",
        error_description: "from error_description",
        error: "from error",
      }),
    ).toBe("from message");
  });

  it("falls back to a generic message for unrecognizable input, without swallowing nothing useful", () => {
    expect(friendlyOAuthError(undefined)).toBe("Something went wrong signing in. Please try again.");
    expect(friendlyOAuthError(null)).toBe("Something went wrong signing in. Please try again.");
    expect(friendlyOAuthError({})).toBe("Something went wrong signing in. Please try again.");
    expect(friendlyOAuthError(42)).toBe("Something went wrong signing in. Please try again.");
  });
});
