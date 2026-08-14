import { defineConfig } from "@playwright/test";

// Staging-only suite. Local Supabase/Docker was retired (2026-08-06) — staging
// is hosted Supabase + Vercel, so every spec runs against a deployed app and
// creates its own per-run users via the service-role key (see
// e2e/staging-helpers.ts). There is no local `next dev` to boot and no
// resettable local DB to seed.
//
// Point E2E_BASE_URL at another deployment (a preview URL, say) to retarget.
const baseURL = process.env.E2E_BASE_URL ?? "https://binding-staging.vercel.app";

// Required for the specs to authenticate and to create/clean their own users.
// Fail loudly and early rather than letting every spec die on a confusing
// middleware redirect or a null Supabase client.
const REQUIRED_ENV = [
  "E2E_SUPABASE_URL",
  "E2E_SERVICE_ROLE_KEY",
  "E2E_STAGING_BASIC_PW",
  "E2E_STAGING_SECRET",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0 && !process.env.PW_SKIP_ENV_CHECK) {
  throw new Error(
    `Playwright needs staging credentials: ${missing.join(", ")} not set.\n` +
      "These live in .env.local (see .env.example) or GitHub Actions secrets.\n" +
      "The suite runs against hosted staging — there is no local-Supabase mode.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Generous: staging is a cold-startable Vercel deployment and the journey
  // specs legitimately run 50s+ when healthy (plus Modal cold starts).
  timeout: 120_000,
  // workers: 2 (was 4). One shared staging database — each spec owns its own
  // users/labels (unique per worker via TEST_RUN_ID's pid suffix), so spec
  // files can run in parallel without cross-spec state interference. But under
  // workers:4 the single Vercel deployment + hosted Supabase + one Modal vLLM
  // engine get saturated by ~4x concurrent server actions and AI calls, which
  // showed up as app-layer hangs (override's onboarding-finish never rendered,
  // a 5s credentials-chip timeout in staging-functional) on the 2026-08-13/14
  // nightly runs. workers:2 halves that contention (suite ~2x slower wall
  // clock, same total Modal spend) while still keeping the production Modal
  // apps (300s scaledown_window) warm naturally across the run.
  workers: 2,
  fullyParallel: false,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
});
