import * as fs from "node:fs";
import { aiCounterFile } from "./staging-helpers";

// Runs ONCE in Playwright's main process, before any worker/spec is spawned —
// do NOT import `@playwright/test` fixtures here, they don't exist yet at
// this point in the lifecycle.
//
// (a) Reset the disk-backed Modal call counter (see staging-helpers.ts) so
// every run starts at zero, regardless of what a previous run left behind.
//
// (b) Optionally warm the Modal endpoints. This is deliberately a SECOND,
// independent warm-up pass from the nightly workflow's `curl` loop
// (.github/workflows/e2e-staging.yml): that one runs before `pnpm install` /
// `playwright install`, which is 5+ minutes ahead of the first spec, and
// Modal's `scaledown_window=120s` means the containers have re-cooled by
// the time tests actually start hitting them — hence the workflow's own
// "re-warm right before tests" step. This global-setup warm-up runs
// immediately before the suite (no install step in between), so it is the
// warm-up that actually matters for cold-start budgets. Both passes are
// intentional, not redundant.
//
// Opt-in via E2E_WARM_MODAL=1: the PR gate (unlike the nightly workflow)
// does not want to touch Modal at all — it leaves this unset so plain
// `pnpm e2e` runs never warm (or spend against) a live Modal endpoint by
// surprise.
const MODAL_ENDPOINTS = [
  "https://thomaskung--binding-embeddings-embedder-embed.modal.run",
  "https://thomaskung--binding-llm-qwen-redact.modal.run",
  "https://thomaskung--binding-llm-qwen-fit-summary.modal.run",
  "https://thomaskung--binding-llm-qwen-refine.modal.run",
  "https://thomaskung--binding-llm-qwen-extract.modal.run",
];

async function warmEndpoint(url: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MODAL_API_TOKEN ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: "warmup" }),
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
    for (const url of MODAL_ENDPOINTS) {
      await warmEndpoint(url);
    }
  }
}
