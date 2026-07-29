import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";

/**
 * Adaptive dashboard's stale frame (DESIGN.md §2d) + the maintenance-nudge
 * suggest-and-approve loop (DESIGN.md §2c), fully self-contained: a fresh
 * seeker account is created via the admin API, published, then its
 * last_profile_activity_at is backdated directly (no product surface exists
 * to fast-forward time) to force the stale state deterministically.
 *
 * publish -> backdate activity -> dashboard shows the stale nudge card ->
 * follow it -> answer -> draft -> approve -> profile republishes, staleness
 * clears, dashboard falls back to the normal matches view.
 */

const PASSWORD = "J0B!Demo#2026$secure";
const SEEKER = { email: "nudge-seeker@e2e.local", password: PASSWORD };

function adminClient() {
  const env: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function ensureUser(email: string) {
  const admin = adminClient();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (data.user || error?.code === "email_exists") return;
    if (attempt === 5) throw new Error(`createUser failed: ${error?.message ?? JSON.stringify(error)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter|onboarding)/);
}

test("stale profile nudges, and approving the draft clears staleness", async ({ page }) => {
  await ensureUser(SEEKER.email);

  // Opts IN to maintenance consent at onboarding — this spec exercises the
  // consented nudge loop; the JIT-consent prompt path is covered separately.
  await signIn(page, SEEKER);
  await completeSeekerOnboarding(page, {
    name: "Nadia Nudge",
    resumeText:
      "Senior Backend Engineer, Acme Pay (2021 - 2024)\nBuilt payment pipelines with PostgreSQL and Kubernetes.",
    maintenanceConsent: true,
  });

  // No product surface can fast-forward 90 days — backdate directly.
  const admin = adminClient();
  const {
    data: { users },
  } = await admin.auth.admin.listUsers();
  const userId = users.find((u) => u.email === SEEKER.email)!.id;
  await admin
    .from("profiles")
    .update({ last_profile_activity_at: new Date(Date.now() - 100 * 86_400_000).toISOString() })
    .eq("id", userId);

  await page.goto("/seeker");
  await expect(page.getByTestId("stale-nudge-card")).toBeVisible();
  await page.getByTestId("stale-nudge-card").getByRole("button", { name: "Draft update" }).click();
  await page.waitForURL(/\/seeker\/nudge/);

  await page.getByTestId("nudge-answer").fill("Shipped a new fraud-detection pipeline this quarter.");
  await page.getByTestId("nudge-draft").click();
  await expect(page.getByTestId("nudge-suggestion")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("nudge-approve").click();
  await page.waitForURL(/\/seeker$/, { timeout: 15_000 });

  await expect(page.getByTestId("stale-nudge-card")).toHaveCount(0);

  // Freshness-confirmation earning (BUSINESS.md §3/§6a) — approving a real
  // suggest-and-approve update earns points, rate-limited to once per
  // cooldown window (src/lib/points.ts earnFreshnessConfirmation).
  const { data: pointRows } = await admin
    .from("points_ledger")
    .select("event, amount")
    .eq("profile_id", userId)
    .eq("event", "verified_action")
    .eq("note", "freshness confirmation");
  expect(pointRows).toHaveLength(1);
  expect(pointRows?.[0]?.amount).toBe(3);
});
