import type { AiProvider } from "./types";
import { stubProvider } from "./stub";
import { modalProvider } from "./modal";

export type { AiProvider, JDTextOnly, JobDraftFields, RedactionResult } from "./types";
export { assertJDTextOnly } from "./types";

/**
 * Provider selection via AI_PROVIDER env var:
 *   stub  (default) — deterministic, no network. Local dev + CI.
 *   modal           — self-hosted Qwen3 models on Modal (modal_app/).
 */
export function getAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER ?? "stub";
  switch (provider) {
    case "modal":
      return modalProvider;
    case "stub":
      return stubProvider;
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
