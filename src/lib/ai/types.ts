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

export interface AiProvider {
  /** Strip PII / generalize quasi-identifiers from resume text. Private-path only. */
  redact(resumeText: string): Promise<RedactionResult>;

  /** 1024-dim embedding for matching. Private-path only. */
  embed(text: string): Promise<number[]>;

  /** Candidate fit summary shown to the recruiter on reveal. Private-path only
   * (consumes redacted candidate text + JD). */
  fitSummary(redactedCandidateText: string, jobDescription: string): Promise<string>;

  /** Refine a seeker profile for better matching. Private-path only. */
  refineProfile(redactedProfileText: string): Promise<string>;

  /** Refine a recruiter-authored JD. This is the one method that MAY be served
   * by a frontier API — hence the branded input type. */
  refineJobDescription(jd: JDTextOnly): Promise<string>;
}
