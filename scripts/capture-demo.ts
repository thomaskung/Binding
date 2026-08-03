import { chromium, type Browser } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.DEMO_BASE_URL ?? "https://binding-staging.vercel.app";
const OUT = "/tmp/binding-demo";
mkdirSync(OUT, { recursive: true });

const PASSWORD = "J0B!Demo#2026$secure";

async function newCtx(browser: Browser) {
  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: {
      username: process.env.DEMO_BASIC_USER ?? "staging",
      password: process.env.DEMO_BASIC_PW ?? "",
    },
    extraHTTPHeaders: { "x-staging-auth": process.env.DEMO_SHARED_SECRET ?? "" },
  });
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter|onboarding)/, { timeout: 30000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report: Record<string, string> = {};

  // ---- Seeker context ----
  const seekerCtx = await newCtx(browser);
  const seeker = await seekerCtx.newPage();

  await seeker.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await seeker.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true });
  report["01-landing"] = (await seeker.locator("body").innerText()).substring(0, 300);

  await signIn(seeker, "seeker@demo.local");
  await seeker.waitForTimeout(1500);
  await seeker.screenshot({ path: `${OUT}/02-seeker-dashboard.png`, fullPage: true });
  report["02-seeker-dashboard"] = (await seeker.locator("body").innerText()).substring(0, 500);
  report["02-url"] = seeker.url();

  await seeker.goto(`${BASE}/seeker/matches`, { waitUntil: "networkidle" });
  await seeker.waitForTimeout(2000);
  await seeker.screenshot({ path: `${OUT}/03-seeker-matches.png`, fullPage: true });
  report["03-seeker-matches"] = (await seeker.locator("body").innerText()).substring(0, 500);

  await seeker.goto(`${BASE}/seeker/profile`, { waitUntil: "networkidle" });
  await seeker.waitForTimeout(1500);
  await seeker.screenshot({ path: `${OUT}/04-seeker-profile.png`, fullPage: true });
  report["04-seeker-profile"] = (await seeker.locator("body").innerText()).substring(0, 500);

  await seekerCtx.close();

  // ---- Recruiter context ----
  const recruiterCtx = await newCtx(browser);
  const recruiter = await recruiterCtx.newPage();

  await signIn(recruiter, "recruiter@demo.local");
  await recruiter.waitForTimeout(1500);
  await recruiter.screenshot({ path: `${OUT}/05-recruiter-dashboard.png`, fullPage: true });
  report["05-recruiter-dashboard"] = (await recruiter.locator("body").innerText()).substring(0, 500);
  report["05-url"] = recruiter.url();

  await recruiter.goto(`${BASE}/recruiter/jobs`, { waitUntil: "networkidle" });
  await recruiter.waitForTimeout(1500);
  await recruiter.screenshot({ path: `${OUT}/06-recruiter-jobs.png`, fullPage: true });
  report["06-recruiter-jobs"] = (await recruiter.locator("body").innerText()).substring(0, 500);

  await recruiterCtx.close();

  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log("Report + screenshots written to", OUT);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
