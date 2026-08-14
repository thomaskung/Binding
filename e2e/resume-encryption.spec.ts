import fs from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Client-held key custody, MVP slice (DESIGN.md §2g Phase 10) against
 * hosted staging.
 *
 * NAMED GAP, not a silent skip: this spec does NOT drive the real passkey
 * enrollment → encrypted-upload ceremony through the browser UI. Playwright
 * Chromium's virtual authenticator support for the WebAuthn `prf` extension
 * specifically is unconfirmed (Chromium issue 430804950 documents `prf`-
 * related rejection behavior in Chromium's own authenticator handling), so
 * a real `navigator.credentials.create/get` ceremony can't be relied on
 * headless in CI. Per the build plan's own Phase 10 spike note, the
 * fallback is to cover the server-side plumbing directly instead:
 *  1. `/api/ingest`'s `encrypt=true` branch — transient extraction, zero
 *     persistence, one `decrypt_access_log` row.
 *  2. Admin-seeded encrypted `resumes`/`user_data_keys` rows — DSAR export
 *     masks ciphertext with an honest placeholder; "delete my original
 *     resume" crypto-shreds (deletes) the wrapped key alongside the row.
 * The crypto primitives themselves (wrap/unwrap, encrypt/decrypt, wrong-key
 * failure) are unit-tested in tests/crypto-envelope.test.ts, which needs no
 * browser at all. The live-ceremony path (enroll → session unlock → encrypt
 * → upload) is the one piece with no automated coverage in this phase —
 * verify it manually with a real passkey before relying on it for a demo.
 *
 * Modal AI cost: ZERO. Onboards via the free wizard-skip path.
 */

function buildFixturePdf(text: string): Promise<Uint8Array> {
  return (async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 400]);
    page.drawText(text, { x: 40, y: 350, size: 12, font, maxWidth: 320 });
    return doc.save();
  })();
}

test("POST /api/ingest with encrypt=true persists nothing and logs the transient access", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Enc Upload") });

  // Not just scoped by profile_id (ensureStagingUser mints a brand-new user
  // every call, so that alone rules out cross-TEST contamination) — also
  // timestamp-floored, so this doesn't silently depend on "nothing in the
  // onboarding flow itself ever writes to `resumes`" staying true. Onboarding
  // here is the resume-text-less wizard-skip path, which doesn't today, but
  // asserting against a floor means a future change to that flow can't turn
  // this into a confusing failure unrelated to what's actually under test.
  const beforeUpload = new Date().toISOString();

  const marker = uniqueLabel("MARKERTEXT");
  const pdfBytes = await buildFixturePdf(`${marker} Software Engineer, 5 years TypeScript and React.`);

  const res = await page.request.post("/api/ingest", {
    multipart: {
      file: { name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfBytes) },
      encrypt: "true",
    },
  });
  expect(res.ok()).toBe(true);
  const json = (await res.json()) as { text: string; rawText: string; strippedPdfBase64: string };
  expect(json.rawText).toContain(marker);
  expect(typeof json.strippedPdfBase64).toBe("string");
  expect(json.strippedPdfBase64.length).toBeGreaterThan(0);

  // Nothing persisted to `resumes` for this transient-mode call, from the
  // moment this test's upload happened onward.
  const { data: resumeRows } = await admin
    .from("resumes")
    .select("id")
    .eq("profile_id", seeker.id)
    .gt("created_at", beforeUpload);
  expect(resumeRows ?? []).toHaveLength(0);

  // Access is logged (not the plaintext itself) — same timestamp floor.
  const { data: logRows } = await admin
    .from("decrypt_access_log")
    .select("purpose")
    .eq("profile_id", seeker.id)
    .gt("accessed_at", beforeUpload);
  expect(logRows ?? []).toHaveLength(1);
  expect(logRows?.[0]?.purpose).toBe("upload_processing");

  await ctx.close();
});

test("Encrypted resume rows: DSAR export masks ciphertext, delete crypto-shreds the wrapped key", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Enc Dsar") });

  const fakeCiphertext = "ZmFrZS1jaXBoZXJ0ZXh0LW5vdC1yZWFsLXBsYWludGV4dA==";
  const { error: resumeInsertError } = await admin.from("resumes").insert({
    profile_id: seeker.id,
    storage_path: null,
    raw_text: fakeCiphertext,
    encrypted: true,
    enc_algo: "aes-256-gcm-v1",
  });
  if (resumeInsertError) throw new Error(`seed resume failed: ${resumeInsertError.message}`);

  const { error: keyInsertError } = await admin.from("user_data_keys").insert({
    profile_id: seeker.id,
    wrapped_dek: "fake-wrapped-dek",
    credential_id: "fake-credential-id",
  });
  if (keyInsertError) throw new Error(`seed data key failed: ${keyInsertError.message}`);

  const { error: recoveryInsertError } = await admin.from("user_data_key_recovery").insert({
    profile_id: seeker.id,
    code_hash: "fake-hash",
    wrapped_dek: "fake-wrapped-dek-recovery",
    salt: "fake-salt",
  });
  if (recoveryInsertError) throw new Error(`seed recovery code failed: ${recoveryInsertError.message}`);

  await page.goto("/seeker/settings/privacy");
  const exportButton = page.getByTestId("dsar-export-button");
  await expect(exportButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  const path = await download.path();
  if (!path) throw new Error("download produced no path");
  const exported = JSON.parse(fs.readFileSync(path, "utf8")) as {
    resumes: Array<{ encrypted: boolean; raw_text: string }>;
  };
  expect(exported.resumes).toHaveLength(1);
  const [exportedResume] = exported.resumes;
  if (!exportedResume) throw new Error("expected one exported resume row");
  expect(exportedResume.encrypted).toBe(true);
  expect(exportedResume.raw_text).not.toBe(fakeCiphertext);
  expect(exportedResume.raw_text).toContain("client-encrypted");

  await page.getByTestId("delete-original-resume").click();
  await page.getByTestId("confirm-delete-resume").click();
  await expect(page.getByTestId("resume-deleted-badge")).toBeVisible({ timeout: 30_000 });

  const { data: keysAfter } = await admin.from("user_data_keys").select("profile_id").eq("profile_id", seeker.id);
  expect(keysAfter ?? []).toHaveLength(0);
  const { data: recoveryAfter } = await admin
    .from("user_data_key_recovery")
    .select("id")
    .eq("profile_id", seeker.id);
  expect(recoveryAfter ?? []).toHaveLength(0);

  await ctx.close();
});
