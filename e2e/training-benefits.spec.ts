import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";

/**
 * Training home (DESIGN.md §7a) + Benefits catalog (DESIGN.md §7b), fully
 * self-contained: a fresh seeker account is created via the admin API and
 * granted training credits directly (the credit-bootstrap gap is deliberate
 * — see src/lib/training.ts — so a first credit has to come from somewhere
 * outside the product for this test, same as it would for a real launch
 * promotion).
 *
 * complete a personal program (spends credits, earns credits + points) ->
 * assert the flywheel wrote through to both ledgers -> Benefits reflects the
 * new lifetime-points signal -> code reveal shows the no-payment-nexus copy.
 */

const PASSWORD = "J0B!Demo#2026$secure";
const SEEKER = { email: "training-seeker@e2e.local", password: PASSWORD };

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

test("complete a training program, then see the Benefits signal move", async ({ page }) => {
  await ensureUser(SEEKER.email);

  await signIn(page, SEEKER);
  await completeSeekerOnboarding(page, { name: "Tara Trainee" });

  const admin = adminClient();
  const {
    data: { users },
  } = await admin.auth.admin.listUsers();
  const userId = users.find((u) => u.email === SEEKER.email)!.id;
  await admin
    .from("training_credits_ledger")
    .insert({ profile_id: userId, event: "earned", amount: 50, note: "e2e bootstrap grant" });

  await page.goto("/training");
  await expect(page.getByTestId("training-program-card").first()).toBeVisible();
  await page.getByTestId("complete-program").first().click();
  await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 15_000 });

  const { data: creditRows } = await admin
    .from("training_credits_ledger")
    .select("event, amount")
    .eq("profile_id", userId)
    .eq("event", "earned")
    .eq("note", "completed: System Design Fundamentals");
  expect(creditRows).toHaveLength(1);
  const { data: pointRows } = await admin
    .from("points_ledger")
    .select("event")
    .eq("profile_id", userId)
    .eq("event", "verified_action");
  expect(pointRows).toHaveLength(1);

  await page.goto("/benefits");
  await expect(page.getByTestId("benefit-tier-badge")).toHaveText("Tier 1");
  await page.getByTestId("get-code").first().click();
  await expect(page.getByTestId("benefit-code").first()).toBeVisible();
  await expect(
    page.getByText("Binding never processes this payment.").first(),
  ).toBeVisible();
});
