import { credentialsFloorSummary } from "@/lib/credentials";
import type { AiProvider, ExtractedExperienceEntry, ExtractedProfileFields, JDTextOnly, RedactionResult } from "./types";

/**
 * Deterministic stub provider for local dev and CI: zero network calls, zero
 * cost, stable outputs for the same inputs. Not a quality bar — a plumbing bar.
 */

const EMBED_DIMS = 1024;

// Keyword dictionaries for the deterministic extraction heuristic — plausible
// and stable, not an NLP model. Real extraction quality comes from the Modal
// path (see modal.ts).
const SKILL_KEYWORDS = [
  "JavaScript", "TypeScript", "React", "Node.js", "Python", "Go", "Rust", "Java", "C++",
  "PostgreSQL", "MySQL", "MongoDB", "AWS", "GCP", "Azure", "Docker", "Kubernetes", "GraphQL",
  "SQL", "Redis", "Kafka", "Terraform", "System Design", "CI/CD",
];
const INDUSTRY_KEYWORDS = [
  "Fintech", "Healthtech", "E-commerce", "DevTools", "Gaming", "Logistics", "EdTech",
  "Cybersecurity", "Payments", "Insurtech", "Proptech", "Adtech",
];
// Matches lines like "Senior Backend Engineer, Acme Pay (2021 – 2024)" or
// "Backend Engineer at Acme Pay (2019-Present)".
const EXPERIENCE_LINE = /^(.+?)(?:,|\bat\b)\s*(.+?)\s*\((\d{4})\s*[-–—]\s*(\d{4}|present)\)\s*$/i;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractExperienceEntries(text: string): ExtractedExperienceEntry[] {
  const fallbackIndustry = INDUSTRY_KEYWORDS.find((i) => text.toLowerCase().includes(i.toLowerCase())) ?? null;
  const entries: ExtractedExperienceEntry[] = [];
  for (const rawLine of text.split("\n")) {
    const match = EXPERIENCE_LINE.exec(rawLine.trim());
    if (!match) continue;
    const [, role, company, startYear, endRaw] = match as unknown as [string, string, string, string, string];
    const isPresent = endRaw.toLowerCase() === "present";
    entries.push({
      role: role.trim(),
      company: company.trim(),
      industry: fallbackIndustry,
      startDate: `${startYear}-01-01`,
      endDate: isPresent ? null : `${endRaw}-12-31`,
    });
  }
  return entries;
}

// Naive PII patterns. The real redaction quality comes from the Modal path;
// this only needs to be plausible and deterministic.
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[EMAIL]"],
  [/\+?\d[\d\s()-]{7,}\d/g, "[PHONE]"],
  [/\b(?:19|20)\d{2}\b/g, "[YEAR]"],
  [/\b\d+(?:\.\d+)?\s*(?:years?|yrs?)\b/gi, "[YEARS] years"],
  [/\b\d[\d,.]*[MK]?\+?\s*(?:users|customers|clients)\b/gi, "[SCALE] users"],
];

function hashCode(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 2654435761);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export const stubProvider: AiProvider = {
  async redact(resumeText: string): Promise<RedactionResult> {
    let redacted = resumeText;
    for (const [pattern, replacement] of PII_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return { redactedText: redacted };
  },

  async embed(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding: token-hash bag projected onto the unit
    // sphere. Similar texts share tokens -> similar vectors, so matching
    // behaves sensibly enough to demo and test against.
    const vec = new Array<number>(EMBED_DIMS).fill(0);
    const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const token of tokens) {
      const idx = hashCode(token, 17) % EMBED_DIMS;
      const sign = hashCode(token, 31) % 2 === 0 ? 1 : -1;
      vec[idx] = (vec[idx] ?? 0) + sign;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  },

  async fitSummary(redactedCandidateText: string, jobDescription: string): Promise<string> {
    const candidateTokens = new Set(
      redactedCandidateText.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3),
    );
    const overlap = jobDescription
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3 && candidateTokens.has(t));
    const highlights = [...new Set(overlap)].slice(0, 5);
    return highlights.length > 0
      ? `Candidate profile overlaps this role on: ${highlights.join(", ")}. (stub summary)`
      : "Candidate profile surfaced by vector similarity. (stub summary)";
  },

  async refineProfile(redactedProfileText: string, instruction?: string): Promise<string> {
    // Trivial cleanup transform: trim lines, collapse blank runs. The
    // instruction doesn't change stub behavior (deterministic, no real AI
    // call) beyond a visible marker so e2e/manual checks can confirm it
    // reached the provider.
    const cleaned = redactedProfileText
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return instruction ? `${cleaned}\n\n[stub refine: ${instruction}]` : cleaned;
  },

  async refineJobDescription(jd: JDTextOnly): Promise<string> {
    return (jd as string)
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  },

  async extractProfileFields(resumeText: string): Promise<ExtractedProfileFields> {
    const experience = extractExperienceEntries(resumeText);
    const skills = SKILL_KEYWORDS.filter((k) => new RegExp(`\\b${escapeRegex(k)}\\b`, "i").test(resumeText));
    const industries = INDUSTRY_KEYWORDS.filter((k) => resumeText.toLowerCase().includes(k.toLowerCase()));
    const roles = [...new Set(experience.map((e) => e.role))];
    return { skills, roles, industries, experience };
  },

  async draftMaintenanceUpdate(_currentProfileSummary: string, userAnswer: string): Promise<string> {
    const trimmed = userAnswer.trim();
    if (!trimmed) return "";
    // Deterministic stub: restructure only what the user supplied — never invent.
    return `${trimmed.replace(/\.+$/, "")}.`;
  },

  async generalizeCredentials(rawCredentials: string): Promise<string> {
    // The deterministic floor IS the stub output — safe by construction.
    return credentialsFloorSummary(rawCredentials);
  },

  async careerAssist(
    message: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    // Deterministic stub: echo back a canned response that includes the
    // user's message so e2e/manual checks can confirm it reached the provider.
    const historyNote = history && history.length > 0 ? ` (with ${history.length} prior messages)` : "";
    return `Career assistant stub response${historyNote}: You wrote: "${message}"`;
  },
};
