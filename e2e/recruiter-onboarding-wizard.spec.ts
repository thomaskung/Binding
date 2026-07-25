import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * Recruiter onboarding's 3-step wizard (account+ToS -> company details ->
 * first-job-post hand-off), mirroring the seeker wizard's step-state pattern.
 * Fresh account via the admin API so this never disturbs the seeded demo
 * account. Drives all 3 steps, then the skip-to-dashboard path from step 3,
 * and confirms step 2's fields actually persisted (not just rendered).
 */

const PASSWORD = "J0B!Demo#2026$secure";
const RECRUITER = { email: "recruiter-wizard@e2e.local", password: PASSWORD };

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

test("recruiter onboarding: account -> company details -> first-job hand-off, skip lands on dashboard", async ({
  page,
}) => {
  await ensureUser(RECRUITER.email);

  // --- Step 1: account + ToS ---
  await page.goto("/login");
  await page.getByLabel("Work email").fill(RECRUITER.email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(RECRUITER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/onboarding/);
  await page.getByTestId("choose-recruiter").click();
  await page.waitForURL(/onboarding\/recruiter$/);
  await page.getByTestId("recruiter-name").fill("Wanda Wizard");
  await page.getByTestId("recruiter-company").fill("Wizard Talent Co");
  await page.getByTestId("recruiter-tos").check();
  await page.getByTestId("recruiter-continue").click();
  await page.waitForURL(/onboarding\/recruiter\/profile$/);

  // --- Step 2: company details ---
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await page.getByTestId("recruiter-onboarding-title").fill("Head of Talent");
  await page.getByTestId("recruiter-onboarding-industry").fill("Fintech");
  await page.getByTestId("recruiter-onboarding-size").click();
  await page.getByRole("option", { name: "51–500" }).click();
  await page.getByTestId("recruiter-onboarding-phone").fill("+65 9123 4567");
  await page.getByTestId("recruiter-onboarding-continue").click();

  // --- Step 3: first-job-post hand-off ---
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await expect(page.getByTestId("recruiter-onboarding-post-job")).toBeVisible();
  await page.getByTestId("recruiter-onboarding-finish-skip").click();
  await page.waitForURL(/\/recruiter\/jobs$/);
  await expect(page.getByTestId("points-balance")).toHaveText("100 points");

  // Step 2's fields actually persisted, not just rendered mid-wizard.
  const admin = adminClient();
  const { data: authUser } = await admin.auth.admin.listUsers();
  const user = authUser.users.find((u) => u.email === RECRUITER.email);
  const { data: profile } = await admin
    .from("profiles")
    .select("recruiter_title, company_industry, company_size, phone, display_name, company_name")
    .eq("id", user!.id)
    .single();
  expect(profile).toMatchObject({
    recruiter_title: "Head of Talent",
    company_industry: "Fintech",
    company_size: "mid",
    phone: "+65 9123 4567",
    display_name: "Wanda Wizard",
    company_name: "Wizard Talent Co",
  });
});
