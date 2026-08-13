import * as fs from "node:fs";
import { aiCounterFile } from "./staging-helpers";

// Runs ONCE in Playwright's main process, before any worker/spec is spawned —
// do NOT import `@playwright/test` fixtures here, they don't exist yet at
// this point in the lifecycle.
//
// (a) Reset the disk-backed Modal call counter (see staging-helpers.ts) so
// every run starts at zero, regardless of what a previous run left behind.
//
// (b) Optionally warm the Modal endpoints. Endpoint URLs come from env vars
// (MODAL_*_URL), set by the CI workflow to the E2E Modal apps
// (binding-*-e2e) it just fetched from Vercel. No hardcoded URLs.
//
// Opt-in via E2E_WARM_MODAL=1: the PR gate (unlike the nightly workflow)
// does not want to touch Modal at all — it leaves this unset so plain
// `pnpm e2e` runs never warm (or spend against) a live Modal endpoint by
// surprise.
// Each endpoint needs a body matching its own schema (modal_app/llm*.py
// module docstrings). A generic `{"text":"warmup"}` ping works for
// redact/refine/extract/credentials (they all read `body["text"]`), but
// `fit_summary` reads `body["candidate"]`/`body["job"]` with no fallback —
// sending it the generic shape throws an unhandled KeyError server-side
// (HTTP 500) on every single warm-up attempt (see e2e-staging.yml).
// One endpoint per app: redact/refine/extract/fit-summary all live on
// binding-llm (same container + model load), so warming redact warms all four.
// Warming all 6 would fire 4 concurrent requests at one cold app and risk
// Modal scale-out. Credentials stays because it's the only place that endpoint
// is exercised in CI (no test profile sets credentials).
const WARM_ENDPOINTS: Array<{ varName: string; body: Record<string, string> }> = [
  { varName: "MODAL_EMBED_URL", body: { text: "warmup" } },
  { varName: "MODAL_REDACT_URL", body: { text: "warmup" } },
  // credentials endpoint requires kind:"credentials" — anything else is a 400
  // (its fail-loud guard). Include the kind so the warm-up is a clean 200.
  { varName: "MODAL_CREDENTIALS_URL", body: { text: "warmup", kind: "credentials" } },
];

function endpointFor(varName: string, body: Record<string, string>): { url: string; body: Record<string, string> } {
  const url = process.env[varName];
  if (!url) {
    throw new Error(
      `Missing ${varName} env var — cannot warm endpoint. The CI workflow must ` +
        "fetch the E2E Modal URLs from Vercel and export them as MODAL_*_URL.",
    );
  }
  return { url, body };
}

async function warmEndpoint(url: string, body: Record<string, string>): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MODAL_API_TOKEN ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      console.log(`[global-setup] warm ${url} attempt ${attempt} -> ${res.status}`);
      if (res.status === 200) return;
    } catch (err) {
      console.log(`[global-setup] warm ${url} attempt ${attempt} -> error: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  // Never fail the run on warm-up failure — a still-cold endpoint just means
  // the first real spec eats the cold-start cost instead of this step.
  console.warn(`[global-setup] WARNING: ${url} did not return 200 after 5 attempts — continuing anyway.`);
}

export default async function globalSetup(): Promise<void> {
  const file = aiCounterFile();
  fs.rmSync(file, { force: true });

  if (process.env.E2E_WARM_MODAL === "1") {
    // Warm all endpoints CONCURRENTLY: 3 cold starts in ~3 min instead of ~7
    // serial, and no skew (the first-warmed container can't cool while the rest
    // are still warming — that skew caused the smoke cold-start race).
    const endpoints = WARM_ENDPOINTS.map(({ varName, body }) => endpointFor(varName, body));
    await Promise.all(endpoints.map(({ url, body }) => warmEndpoint(url, body)));
  }
}
