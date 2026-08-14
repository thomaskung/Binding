import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Personal-agent MCP, thin read-only slice (DESIGN.md §14e, Phase 11)
 * against hosted staging. Two layers, per the build plan:
 *  1. Protocol-level: raw HTTP POSTs to /api/mcp via Playwright's `request`
 *     fixture — no browser interaction needed for the JSON-RPC surface
 *     itself (the dispatcher's pure logic is separately unit-tested in
 *     tests/agent-mcp.test.ts; this covers the real route: bearer auth,
 *     consent gate, revocation, and the actual Supabase round-trip).
 *  2. A thin UI pass: the agent-access consent toggle (Privacy settings)
 *     and token create/revoke controls (Security settings) actually render
 *     and work, filling the Phase 6 placeholder.
 *
 * Modal AI cost: ZERO. Onboards via the free wizard-skip path; nothing here
 * calls an AI provider.
 */

test("MCP route: consent-gated, bearer-authed, revocable — end to end via real HTTP", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Agent MCP") });

  // No consent yet — token creation must refuse.
  await page.goto("/seeker/settings/security");
  await expect(page.getByTestId("agent-access-consent-required")).toBeVisible({ timeout: 30_000 });

  // Grant consent from Privacy settings (mirrors the connected-accounts
  // toggle pattern in e2e/settings-privacy.spec.ts).
  await page.goto("/seeker/settings/privacy");
  const consentToggle = page.getByTestId("agent-access-toggle");
  await expect(consentToggle).toBeVisible({ timeout: 30_000 });
  await expect(consentToggle).toHaveAttribute("aria-checked", "false");
  await consentToggle.click();
  await expect(consentToggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("agent-access-toggle")).toHaveAttribute("aria-checked", "true");

  // Create a token via the real UI now that consent is granted.
  await page.goto("/seeker/settings/security");
  await expect(page.getByTestId("create-agent-token")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("agent-token-label-input").fill(uniqueLabel("test-agent"));
  await page.getByTestId("create-agent-token").click();
  const tokenValueInput = page.getByTestId("new-agent-token-value");
  await expect(tokenValueInput).toBeVisible({ timeout: 30_000 });
  const token = await tokenValueInput.inputValue();
  expect(token).toMatch(/^bnd_agent_[0-9a-f]+$/);
  await page.getByTestId("agent-token-saved").click();

  // tools/list — no auth needed to enumerate, but this route requires it
  // regardless (protocol-level, raw HTTP, no browser page involved).
  const listRes = await page.request.post("/api/mcp", {
    headers: { authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(listRes.ok()).toBe(true);
  const listBody = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
  expect(listBody.result.tools.map((t) => t.name).sort()).toEqual(
    ["get_match_status", "get_points_balance", "get_profile_summary"].sort(),
  );

  // tools/call — real round-trip against this seeker's own real data.
  const balanceRes = await page.request.post("/api/mcp", {
    headers: { authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_points_balance" } },
  });
  const balanceBody = (await balanceRes.json()) as { result: { balance: number } };
  expect(typeof balanceBody.result.balance).toBe("number");

  // Wrong/garbage bearer token is rejected.
  const badAuthRes = await page.request.post("/api/mcp", {
    headers: { authorization: "Bearer not-a-real-token" },
    data: { jsonrpc: "2.0", id: 3, method: "tools/list" },
  });
  expect(badAuthRes.status()).toBe(401);

  // Access is logged (per-profile, scoped — not a global count).
  const { data: logRows } = await admin.from("agent_access_log").select("tool").eq("profile_id", seeker.id);
  expect((logRows ?? []).length).toBeGreaterThanOrEqual(2);

  // Revoke via the real UI — the token must stop working immediately.
  await page.goto("/seeker/settings/security");
  await page.getByTestId("revoke-agent-token").first().click();
  await expect(page.getByTestId("agent-token-revoked-badge").first()).toBeVisible({ timeout: 30_000 });

  const afterRevokeRes = await page.request.post("/api/mcp", {
    headers: { authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: 4, method: "tools/list" },
  });
  expect(afterRevokeRes.status()).toBe(401);

  await ctx.close();
});

test("Withdrawing agent-access consent disables an already-issued token (the de facto kill switch)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Agent Kill") });

  await page.goto("/seeker/settings/privacy");
  const consentToggle = page.getByTestId("agent-access-toggle");
  await expect(consentToggle).toBeVisible({ timeout: 30_000 });
  await consentToggle.click();
  await expect(consentToggle).toHaveAttribute("aria-checked", "true");

  await page.goto("/seeker/settings/security");
  await page.getByTestId("agent-token-label-input").fill(uniqueLabel("kill-switch-test"));
  await page.getByTestId("create-agent-token").click();
  const token = await page.getByTestId("new-agent-token-value").inputValue();
  await page.getByTestId("agent-token-saved").click();

  const beforeWithdraw = await page.request.post("/api/mcp", {
    headers: { authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(beforeWithdraw.ok()).toBe(true);

  await page.goto("/seeker/settings/privacy");
  await page.getByTestId("agent-access-toggle").click();
  await expect(page.getByTestId("agent-access-toggle")).toHaveAttribute("aria-checked", "false");

  // Same token, never revoked — but consent is gone, so the route refuses.
  const afterWithdraw = await page.request.post("/api/mcp", {
    headers: { authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(afterWithdraw.status()).toBe(403);

  await ctx.close();
});
