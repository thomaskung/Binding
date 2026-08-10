import { credentialsFloorSummary, credentialsLooksSafe } from "@/lib/credentials";
import type { AiProvider, ExtractedProfileFields, JDTextOnly, RedactionResult } from "./types";

/**
 * Private-LLM provider: self-hosted Qwen3 8B + Qwen3-Embedding-0.6B on Modal
 * (see modal_app/). All candidate-derived data stays on this path — never a
 * frontier API (DESIGN.md privacy rule).
 */

interface ModalConfig {
  redactUrl: string;
  summaryUrl: string;
  refineUrl: string;
  embedUrl: string;
  extractUrl: string;
  apiToken: string;
}

function config(): ModalConfig {
  const redactUrl = process.env.MODAL_REDACT_URL;
  const summaryUrl = process.env.MODAL_SUMMARY_URL;
  const refineUrl = process.env.MODAL_REFINE_URL;
  const embedUrl = process.env.MODAL_EMBED_URL;
  const extractUrl = process.env.MODAL_EXTRACT_URL;
  const apiToken = process.env.MODAL_API_TOKEN;
  if (!redactUrl || !summaryUrl || !refineUrl || !embedUrl || !extractUrl || !apiToken) {
    throw new Error(
      "AI_PROVIDER=modal requires MODAL_REDACT_URL, MODAL_SUMMARY_URL, MODAL_REFINE_URL, MODAL_EMBED_URL, MODAL_EXTRACT_URL and MODAL_API_TOKEN",
    );
  }
  return { redactUrl, summaryUrl, refineUrl, embedUrl, extractUrl, apiToken };
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
    const c = config();
    return post<RedactionResult>(c.redactUrl, c.apiToken, { text: resumeText });
  },

  async embed(text: string): Promise<number[]> {
    const c = config();
    const { embedding } = await post<{ embedding: number[] }>(c.embedUrl, c.apiToken, { text });
    return embedding;
  },

  async fitSummary(redactedCandidateText: string, jobDescription: string): Promise<string> {
    const c = config();
    const { summary } = await post<{ summary: string }>(c.summaryUrl, c.apiToken, {
      candidate: redactedCandidateText,
      job: jobDescription,
    });
    return summary;
  },

  async refineProfile(redactedProfileText: string, instruction?: string): Promise<string> {
    const c = config();
    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: redactedProfileText,
      kind: "profile",
      instruction,
    });
    return refined;
  },

  async refineJobDescription(jd: JDTextOnly): Promise<string> {
    const c = config();
    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: jd,
      kind: "job_description",
    });
    return refined;
  },

  async extractProfileFields(resumeText: string): Promise<ExtractedProfileFields> {
    const c = config();
    return post<ExtractedProfileFields>(c.extractUrl, c.apiToken, { text: resumeText });
  },

  async draftMaintenanceUpdate(currentProfileSummary: string, userAnswer: string): Promise<string> {
    const c = config();
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
    // Ask the self-hosted model to generalize; but the deterministic floor is
    // the guarantee — if the model output still carries a specific identifier
    // (or the call fails), fall back to the floor. The model can only ever
    // REMOVE specifics, never smuggle one through.
    try {
      const c = config();
      const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
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
    const c = config();
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
