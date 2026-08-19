import { credentialsFloorSummary, credentialsLooksSafe } from "@/lib/credentials";
import { searchCompanyInfo } from "@/lib/web-search";
import type {
  AiProvider,
  AssessmentGradeResult,
  CompanyIdentifier,
  ExtractedProfileFields,
  JDTextOnly,
  JobDraftFields,
  RedactionResult,
  ScreeningQuestionDraft,
} from "./types";

/**
 * Private-LLM provider: self-hosted Qwen3 small + medium models + embeddings on
 * Modal (see modal_app/). All candidate-derived data stays on this path —
 * never a frontier API (DESIGN.md privacy rule).
 *
 * Two production apps, all scaledown_window=120s:
 *   - binding-llm        (1.7B) — redact / extract / fit-summary / refine,
 *                         including credentials generalization (the former
 *                         binding-llm-small 0.6B was merged in 2026-08-18)
 *   - binding-embeddings — 1024-dim embeddings (CPU-only since 2026-08-18)
 * No separate E2E apps: the E2E suite runs in parallel (~10 min), so the
 * production apps' 120s scaledown keeps containers warm naturally across the
 * run. Endpoint URLs come from the MODAL_*_URL env vars (Vercel).
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

function config(): ModalConfig {
  const redactUrl = process.env.MODAL_REDACT_URL;
  const credentialsUrl = process.env.MODAL_CREDENTIALS_URL;
  const summaryUrl = process.env.MODAL_SUMMARY_URL;
  const refineUrl = process.env.MODAL_REFINE_URL;
  const embedUrl = process.env.MODAL_EMBED_URL;
  const extractUrl = process.env.MODAL_EXTRACT_URL;
  const apiToken = process.env.MODAL_API_TOKEN;
  if (!redactUrl || !credentialsUrl || !summaryUrl || !refineUrl || !embedUrl || !extractUrl || !apiToken) {
    throw new Error(
      "AI_PROVIDER=modal requires MODAL_REDACT_URL, MODAL_CREDENTIALS_URL, MODAL_SUMMARY_URL, MODAL_REFINE_URL, MODAL_EMBED_URL, MODAL_EXTRACT_URL and MODAL_API_TOKEN",
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Defensive normalization for the /extract endpoint's job_extract/
 * job_generate responses: a 1.7B model asked to emit JSON for a whole job
 * posting (nested arrays, free-form description) can truncate mid-object or
 * omit a field entirely — unlike the model can only ever REMOVE specifics
 * (credentials) posture, here a malformed response must degrade to an empty
 * draft the recruiter sees as "nothing extracted," never a crash or a
 * preview rendering `undefined`. */
function normalizeJobDraft(raw: Partial<JobDraftFields>): JobDraftFields {
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    department: typeof raw.department === "string" ? raw.department : null,
    skills: stringArray(raw.skills),
    responsibilities: stringArray(raw.responsibilities),
    requirements: stringArray(raw.requirements),
    description: typeof raw.description === "string" ? raw.description : "",
  };
}

/** Defensive normalization for the /extract endpoint's screening_questions
 * response — same "malformed degrades to empty, never a crash" posture as
 * normalizeJobDraft above. A question missing either field is dropped
 * entirely rather than kept with a blank half (a question with no rubric
 * can never be graded; a rubric with no question can never be shown). */
function normalizeScreeningQuestions(raw: unknown): ScreeningQuestionDraft[] {
  const list = Array.isArray((raw as { questions?: unknown })?.questions)
    ? (raw as { questions: unknown[] }).questions
    : [];
  return list
    .filter((q): q is { question: unknown; rubric: unknown } => typeof q === "object" && q !== null)
    .map((q) => ({
      question: typeof q.question === "string" ? q.question : "",
      rubric: typeof q.rubric === "string" ? q.rubric : "",
    }))
    .filter((q) => q.question.trim() !== "" && q.rubric.trim() !== "");
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

  async extractJobFields(jd: JDTextOnly): Promise<JobDraftFields> {
    const c = config();
    const raw = await post<Partial<JobDraftFields>>(c.extractUrl, c.apiToken, {
      text: jd,
      kind: "job_extract",
    });
    return normalizeJobDraft(raw);
  },

  async generateJob(prompt: JDTextOnly): Promise<JobDraftFields> {
    const c = config();
    const raw = await post<Partial<JobDraftFields>>(c.extractUrl, c.apiToken, {
      text: prompt,
      kind: "job_generate",
    });
    return normalizeJobDraft(raw);
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
    // Ask the self-hosted model (Qwen3-1.7B since the 0.6B binding-llm-small
    // app was merged into binding-llm on 2026-08-18) to generalize; but the
    // deterministic floor is the guarantee — if the model output still carries
    // a specific identifier (or the call fails), fall back to the floor. The
    // model can only ever REMOVE specifics, never smuggle one through.
    try {
      const c = config();
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

  async gradeAssessmentAttempt(rubric: string, answerText: string): Promise<AssessmentGradeResult> {
    const c = config();
    const raw = await post<Partial<AssessmentGradeResult>>(c.extractUrl, c.apiToken, {
      text: answerText,
      context: rubric,
      kind: "assessment_grade",
    });
    // Defensive normalize (same discipline as normalizeJobDraft above) — a
    // malformed/partial model response fails CLOSED (not passed), never
    // silently grants a pass on missing data.
    return {
      passed: raw.passed === true,
      rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    };
  },

  async generateScreeningQuestions(jd: JDTextOnly): Promise<ScreeningQuestionDraft[]> {
    const c = config();
    const raw = await post<unknown>(c.extractUrl, c.apiToken, {
      text: jd,
      kind: "screening_questions",
    });
    return normalizeScreeningQuestions(raw);
  },

  async researchCompany(company: CompanyIdentifier): Promise<string> {
    // Real external call #1: public-source grounding text (not Modal, not
    // tracked by countAiCall() — see web-search.ts's own doc comment).
    const groundingText = await searchCompanyInfo(company);
    if (!groundingText.trim()) {
      // No search results at all — summarizing nothing would mean the model
      // fabricates a company profile from its own (possibly stale/wrong)
      // pretraining knowledge, exactly what the grounding step exists to
      // prevent. Fail honest instead of calling Modal on empty input.
      return "No public information found for this company.";
    }
    const c = config();
    // Real external call #2: Modal summarizes the grounding text — this one
    // IS a normal Modal round-trip, dispatched through /refine like
    // career_assist/job_description/maintenance_update (all plain-string
    // results, unlike /extract's structured-JSON kinds).
    const { refined } = await post<{ refined: string }>(c.refineUrl, c.apiToken, {
      text: groundingText,
      company,
      kind: "company_research",
    });
    return refined;
  },
};
