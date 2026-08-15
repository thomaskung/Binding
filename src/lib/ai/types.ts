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

/** Structured job-posting fields either extracted from a pasted external JD
 * or drafted from a short recruiter prompt (Phase 8, DESIGN.md §13b). Kept to
 * the subset of `EditableJob` (job-editor.tsx) that is realistically
 * extractable/generatable from text alone — no salary numbers, employment
 * type, work setup, or location detection; the recruiter fills those in by
 * hand after applying a draft. Suggest-and-approve only: never auto-applied
 * to the live form. */
export interface JobDraftFields {
  title: string;
  department: string | null;
  skills: string[];
  responsibilities: string[];
  requirements: string[];
  description: string;
}

/** Open-ended skill-assessment grading result (DESIGN.md §14b, Phase 12).
 * `rationale` is for founder spot-audits only (§14b's substitute for
 * per-attempt human review) — never shown to the candidate or recruiter as
 * product copy. */
export interface AssessmentGradeResult {
  passed: boolean;
  rationale: string;
}

/** One AI-drafted candidate-facing screening question + its grading rubric
 * (DESIGN.md §14c, Phase 13). `rubric` is grading-only, never shown to the
 * candidate — same posture as AssessmentGradeResult's rationale field and
 * skill_assessments.rubric before it. A draft only: the recruiter reviews/
 * edits before publish, same gate as Phase 12's rubric bank. */
export interface ScreeningQuestionDraft {
  question: string;
  rubric: string;
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

  /** Extract structured job-posting fields from a recruiter-pasted external
   * JD. Recruiter-authored input only (JDTextOnly) — never candidate data.
   * Never fabricates fields the source text doesn't support; a field the
   * source text doesn't clearly imply comes back empty, not invented. */
  extractJobFields(jd: JDTextOnly): Promise<JobDraftFields>;

  /** Generate a full draft job posting from a short recruiter prompt
   * (role/team/location cues). Recruiter-authored input only (JDTextOnly).
   * A draft to review and edit, never auto-published. */
  generateJob(prompt: JDTextOnly): Promise<JobDraftFields>;

  /** Draft the maintenance-nudge's suggested profile addition from the
   * seeker's free-text answer to "anything new?". Private-path only.
   * Suggest-and-approve — the result is never auto-applied. */
  draftMaintenanceUpdate(currentProfileSummary: string, userAnswer: string): Promise<string>;

  /** Generalize free-text credentials (awards/certs/patents) into a
   * de-identified summary for the recruiter card. Private-path only (raw
   * credentials are candidate-derived). MUST NOT preserve specific identifiers
   * (patent numbers, exact award titles/years) — implementations fall back to
   * the deterministic category+count floor (src/lib/credentials.ts) if the
   * model output still looks identifying. */
  generalizeCredentials(rawCredentials: string): Promise<string>;

  /** Open-ended career assistant chat (resume rewriting, cover letters,
   * interview prep, career-path guidance). Private-path only — never a frontier
   * API, same as every other method here. This is a simple/unmetered lookalike
   * for now; the real metered, classifier-gated Pillar 5 system (BUSINESS.md)
   * is still on the roadmap. */
  careerAssist(
    message: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string>;

  /** Grade an open-ended skill-assessment answer against a founder/recruiter
   * -reviewed rubric (DESIGN.md §14b, supersedes §13d's MCQ auto-score).
   * Private-path only — both `rubric` (may reflect prior candidate answers
   * indirectly via iteration) and `answerText` (always candidate-derived)
   * are plain strings, never JDTextOnly. Grading is binary pass/fail against
   * the rubric's stated bar, not a numeric score — matches the rest of the
   * codebase's "qualitative signal only" posture (matchBand, band-only
   * reveal signals). */
  gradeAssessmentAttempt(rubric: string, answerText: string): Promise<AssessmentGradeResult>;

  /** Generate candidate-facing screening questions (+ grading rubrics) from a
   * recruiter's own job-posting text (DESIGN.md §14c, Phase 13). Recruiter-
   * authored input only (JDTextOnly), same frontier-capable posture as
   * extractJobFields/generateJob — a draft to review/edit before publish,
   * never auto-published. Grading a candidate's answer against the returned
   * rubric reuses gradeAssessmentAttempt (private-path, candidate-derived
   * answer text) rather than a separate method — the grading task is
   * identical (rubric + answer -> pass/rationale) regardless of which
   * feature produced the rubric. */
  generateScreeningQuestions(jd: JDTextOnly): Promise<ScreeningQuestionDraft[]>;
}
