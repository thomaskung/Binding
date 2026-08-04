import { defineConfig } from "@playwright/test";

// Overridable port: unrelated local services (other projects' Docker
// containers) sometimes hold 3000, and `next dev` silently hopping to 3001
// strands the webServer health check. `E2E_PORT=3100 pnpm e2e` sidesteps it.
const PORT = process.env.E2E_PORT ?? "3000";

// A remote run (staging / CI) points E2E_BASE_URL at a deployed app — there is
// no local `next dev` to boot, and the env vars needed to boot one
// (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) aren't set there either. Only boot the
// local webServer for genuinely local runs.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const isRemote = !!process.env.E2E_BASE_URL && !baseURL.includes("localhost") && !baseURL.includes("127.0.0.1");

export default defineConfig({
  testDir: "./e2e",
  // Local runs can't talk to the staging environment (secrets, basic auth,
  // hosted Supabase) — skip the staging-only specs unless explicitly targeting
  // a remote baseURL. CI passes E2E_BASE_URL so they run there.
  testIgnore: isRemote ? [] : ["e2e/staging-*.spec.ts"],
  // 120s: local dev-mode runs pay on-demand Turbopack compiles + slow-machine
  // variance; the journey specs (smoke, override) legitimately run 50s+ even
  // when healthy.
  timeout: 120_000,
  // Specs share one local DB — run serially to keep state deterministic.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: isRemote
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
