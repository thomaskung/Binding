/**
 * Provider-agnostic AI interfaces.
 *
 * PRIVACY POLICY (DESIGN.md — frontier API rule):
 * Candidate/resume-derived data (raw text, redacted text, skill vectors,
 * match context) may ONLY be processed by the self-hosted private provider
 * (Modal). A frontier API may only ever receive a recruiter's own JD text.
 * That rule is enforced at the type level via the `JDTextOnly` branded type:
 * the only frontier-capable method accepts `JDTextOnly`, which can only be
 * constructed through `assertJDTextOnly()` at the JD-editor boundary.
 */

declare const jdTextOnlyBrand: unique symbol;

/** JD text authored by the recruiter themselves — the ONLY data shape allowed
 * to reach a frontier API. Never construct from candidate-derived data. */
export type JDTextOnly = string & { readonly [jdTextOnlyBrand]: true };

/** Boundary constructor. Call ONLY with text the recruiter typed/pasted into
 * the job editor. Anything touching candidate data must not pass through here. */
export function assertJDTextOnly(recruiterAuthoredText: string): JDTextOnly {
  return recruiterAuthoredText as JDTextOnly;
}

export interface RedactionResult {
  redactedText: string;
}

export interface ExtractedExperienceEntry {
  role: string;
  company: string;
  industry: string | null;
  startDate: string; // ISO date
  endDate: string | null; // null = present / ongoing
}

export interface ExtractedProfileFields {
  skills: string[];
  roles: string[];
  industries: string[];
  experience: ExtractedExperienceEntry[];
}

export interface AiProvider {
  /** Strip PII / generalize quasi-identifiers from resume text. Private-path only. */
  redact(resumeText: string): Promise<RedactionResult>;

  /** 1024-dim embedding for matching. Private-path only. */
  embed(text: string): Promise<number[]>;

  /** Candidate fit summary shown to the recruiter on reveal. Private-path only
   * (consumes redacted candidate text + JD). */
  fitSummary(redactedCandidateText: string, jobDescription: string): Promise<string>;

  /** Refine a seeker profile for better matching. Private-path only.
   * `instruction` is either a fixed quick-action (free tier) or free-text
   * (Pro tier only, rate-limited — see src/lib/ai-usage.ts and
   * refineProfileText in seeker/actions.ts, which enforce both server-side). */
  refineProfile(redactedProfileText: string, instruction?: string): Promise<string>;

  /** Refine a recruiter-authored JD. This is the one method that MAY be served
   * by a frontier API — hence the branded input type. */
  refineJobDescription(jd: JDTextOnly): Promise<string>;

  /** Structure skills/roles/industries/work-history out of a seeker's raw
   * resume text for onboarding's suggest-and-approve step. Private-path only
   * (raw resume text, pre-redaction — same posture as seeker_experience).
   * Never fabricates: only files what the resume actually says. */
  extractProfileFields(resumeText: string): Promise<ExtractedProfileFields>;

  /** Draft the maintenance-nudge's suggested profile addition from the
   * seeker's free-text answer to "anything new?". Private-path only.
   * Suggest-and-approve — the result is never auto-applied. */
  draftMaintenanceUpdate(currentProfileSummary: string, userAnswer: string): Promise<string>;
}
