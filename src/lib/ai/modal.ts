import { cookies } from "next/headers";
import { credentialsFloorSummary, credentialsLooksSafe } from "@/lib/credentials";
import type { AiProvider, ExtractedProfileFields, JDTextOnly, RedactionResult } from "./types";

/**
 * Private-LLM provider: self-hosted Qwen3 small + medium models + embeddings on
 * Modal (see modal_app/). All candidate-derived data stays on this path —
 * never a frontier API (DESIGN.md privacy rule).
 *
 * Two endpoint sets, switched at request time by the `e2e_modal` cookie:
 *   - production (no cookie): binding-llm-small / binding-llm / binding-embeddings
 *     (scaledown 120s — tuned for real traffic)
 *   - e2e (cookie e2e_modal=1): binding-*-e2e apps (scaledown 3600s — kept warm
 *     across long CI suites so tests never eat a mid-run cold start)
 * The e2e cookie is set by Playwright contexts in the CI specs; human QA on
 * staging hits production Modal. Vercel hosts both env-var sets.
 */

interface ModalConfig {
  redactUrl: string;
  credentialsUrl: string;
  summaryUrl: string;
  refineUrl: string;
  embedUrl: string;
  extractUrl: string;
  apiToken: string;
}

async function config(): Promise<ModalConfig> {
  // Route to the E2E Modal apps when the e2e_modal cookie is set (CI tests).
  // cookies() is async (Next 16) and throws outside a request context (build,
  // health check) — treat that as production.
  let prefix = "";
  try {
    const cookieStore = await cookies();
    if (cookieStore.get("e2e_modal")?.value === "1") prefix = "E2E_";
  } catch {
    // not in a request context — use production endpoints
  }
  const redactUrl = process.env[`${prefix}MODAL_REDACT_URL`];
  const credentialsUrl = process.env[`${prefix}MODAL_CREDENTIALS_URL`];
  const summaryUrl = process.env[`${prefix}MODAL_SUMMARY_URL`];
  const refineUrl = process.env[`${prefix}MODAL_REFINE_URL`];
  const embedUrl = process.env[`${prefix}MODAL_EMBED_URL`];
  const extractUrl = process.env[`${prefix}MODAL_EXTRACT_URL`];
  const apiToken = process.env[`${prefix}MODAL_API_TOKEN`] ?? process.env.MODAL_API_TOKEN;
  if (!redactUrl || !credentialsUrl || !summaryUrl || !refineUrl || !embedUrl || !extractUrl || !apiToken) {
    throw new Error(
      `AI_PROVIDER=modal requires MODAL_REDACT_URL, MODAL_CREDENTIALS_URL, MODAL_SUMMARY_URL, MODAL_REFINE_URL, MODAL_EMBED_URL, MODAL_EXTRACT_URL and MODAL_API_TOKEN (or their E2E_ prefixes when e2e_modal=1)`,
    );
  }
  return { redactUrl, credentialsUrl, summaryUrl, refineUrl, embedUrl, extractUrl, apiToken };
}

async function post<T>(url: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Modal endpoint ${url} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export const modalProvider: AiProvider = {
  async redact(resumeText: string): Promise<RedactionResult> {
    const c = await config();
    return post<RedactionResult>(c.redactUrl, c.apiToken, { text: resumeText });
  },

  async embed(text: string): Promise<number[]> {
    const c = await config();
    const { embedding } = await post<{ embedding: number[] }>(c.embedUrl, c.apiToken, { text });
    return embedding;
  },

  async fitSummary(redactedCandidateText: string, jobDescription: string): Promise<string> {
    const c = await config();
    const { summary } = await post<{ summary: string }>(c.summaryUrl, c.apiToken, {
      candidate: redactedCandidateText,
      job: jobDescription,
    });
    return summary;
  },

  async refineProfile(redactedProfileText: string, instruction?: string): Promise<string> {
    const c = await config();
    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: redactedProfileText,
      kind: "profile",
      instruction,
    });
    return refined;
  },

  async refineJobDescription(jd: JDTextOnly): Promise<string> {
    const c = await config();
    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: jd,
      kind: "job_description",
    });
    return refined;
  },

  async extractProfileFields(resumeText: string): Promise<ExtractedProfileFields> {
    const c = await config();
    return post<ExtractedProfileFields>(c.extractUrl, c.apiToken, { text: resumeText });
  },

  async draftMaintenanceUpdate(currentProfileSummary: string, userAnswer: string): Promise<string> {
    const c = await config();
    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: userAnswer,
      context: currentProfileSummary,
      kind: "maintenance_update",
    });
    return refined;
  },

  async generalizeCredentials(rawCredentials: string): Promise<string> {
    const floor = credentialsFloorSummary(rawCredentials);
    if (!rawCredentials.trim()) return "";
    // Ask the self-hosted small model (0.6B) to generalize; but the
    // deterministic floor is the guarantee — if the model output still carries
    // a specific identifier (or the call fails), fall back to the floor. The
    // model can only ever REMOVE specifics, never smuggle one through.
    try {
      const c = await config();
      const { refined } = await post<{ refined: string }>(c.credentialsUrl, c.apiToken, {
        text: rawCredentials,
        kind: "credentials",
      });
      return credentialsLooksSafe(refined) ? refined.trim() : floor;
    } catch {
      return floor;
    }
  },

  async careerAssist(
    message: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const c = await config();
    // Flatten the conversation: render history as alternating "User: ...\nAssistant: ..."
    // lines followed by the new message, all as one text blob (the underlying
    // Modal endpoint takes one system prompt + one user text blob, no native
    // multi-turn array).
    let conversationText = "";
    if (history && history.length > 0) {
      for (const msg of history) {
        const prefix = msg.role === "user" ? "User:" : "Assistant:";
        conversationText += `${prefix} ${msg.content}\n`;
      }
    }
    conversationText += `User: ${message}`;

    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: conversationText,
      kind: "career_assist",
    });
    return refined;
  },
};
