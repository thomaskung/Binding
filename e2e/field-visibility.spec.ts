import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";

/**
 * Seeker Profile tab's per-field visibility (Phase 2B, src/lib/field-visibility.ts):
 * a "hidden" field must be absent from what recruiters see; a "matching_only"
 * field must ALSO be absent from the recruiter-facing display (it only keeps
 * feeding the match embedding, which isn't observable through the UI — that
 * side is covered by tests/field-visibility.test.ts's pure-function tests).
 * This spec proves the display half through the real publish pipeline.
 */

const PASSWORD = "J0B!Demo#2026$secure";
const SEEKER = { email: "field-visibility-seeker@e2e.local", password: PASSWORD };

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

test("hidden and matching_only fields are excluded from what recruiters see; visible fields still show", async ({
  page,
}) => {
  await ensureUser(SEEKER.email);

  await signIn(page, SEEKER);
  await completeSeekerOnboarding(page, { name: "Vic Visibility" });

  await page.goto("/seeker/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();

  await page.locator("#skills").fill("Rust, Go");
  await page.locator("#industries").fill("Fintech");
  await page.locator("#desired_roles").fill("Backend Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile fields saved.")).toBeVisible();

  // Per-field visibility lives in the Privacy card (always active, not
  // gated behind edit mode). Each change persists via a server action —
  // wait for the committed-write signal after each one, or navigating away
  // can cancel the in-flight save.
  await page.getByLabel("Skills visibility").selectOption("hidden");
  await expect(page.getByText("Visibility updated.")).toBeVisible();
  await page.getByLabel("Target industries visibility").selectOption("matching_only");
  await expect(page.getByText("Visibility updated.")).toBeVisible();

  await page.goto("/seeker/profile/resume");
  await page.getByTestId("profile-draft").fill(
    "Experienced software engineer focused on distributed systems and cloud infrastructure.",
  );
  await page.getByTestId("publish-profile").click();
  await expect(page.getByTestId("redacted-preview")).toBeVisible({ timeout: 15_000 });

  const preview = page.getByTestId("redacted-preview");
  await expect(preview).not.toContainText("Rust");
  await expect(preview).not.toContainText("Fintech");
  await expect(preview).toContainText("Backend Engineer");
});
