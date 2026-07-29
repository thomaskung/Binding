import { defineConfig } from "@playwright/test";

// Overridable port: unrelated local services (other projects' Docker
// containers) sometimes hold 3000, and `next dev` silently hopping to 3001
// strands the webServer health check. `E2E_PORT=3100 pnpm e2e` sidesteps it.
const PORT = process.env.E2E_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  // 120s: local dev-mode runs pay on-demand Turbopack compiles + slow-machine
  // variance; the journey specs (smoke, override) legitimately run 50s+ even
  // when healthy.
  timeout: 120_000,
  // Specs share one local DB — run serially to keep state deterministic.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
