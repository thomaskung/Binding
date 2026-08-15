"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AIDocumentCanvas,
  type AIDocumentSuggestion,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@binding/ui";
import type { JobDraftFields } from "@/lib/ai/types";
import { EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPES, type EmploymentType, type SalaryVisibility, salaryDisplay } from "@/lib/jobs";
import { matchBand } from "@/lib/matching";
import type { ScreeningQuestion } from "@/lib/screening-questions";
import {
  closeJob,
  extractJobFieldsFromText,
  generateJobFromPrompt,
  publishJob,
  refineJobText,
  saveJob,
} from "../actions";
import { ScreeningQuestionsPanel } from "./screening-questions-panel";
import { updateVerifiedSkillPrefs } from "../skill-assessment-actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

const JD_QUICK_ACTIONS = ["Tighten wording", "More inclusive language", "Add impact metrics", "Shorten"];

// Illustrative score for "Candidate sees" preview: a typical match score that
// a free-tier seeker would see as "Normal match". Not tied to any real candidate.
const ILLUSTRATIVE_SCORE = 0.75;

const BAND_LABEL = {
  high: "High match",
  normal: "Normal match",
  low: "Low match",
} as const;

// Explicit label + help copy per visibility value — all three (public/band/
// on_request) are individually selectable in the visibility <Select> below,
// never reached by cycling a binary toggle (that shape let one click silently
// escalate disclosure, e.g. band -> public).
const SALARY_VISIBILITY_LABEL: Record<SalaryVisibility, string> = {
  public: "Public",
  band: "Range shown",
  on_request: "Hidden",
};
const SALARY_VISIBILITY_HELP: Record<SalaryVisibility, string> = {
  public: "The exact salary range is shown on the posting.",
  band: "A coarse band (e.g. “$180k – $220k”) is shown — never the exact figure.",
  on_request:
    "Hidden by default — candidates see “Salary on request” and can ask during matching.",
};

export interface EditableJob {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "closed";
  salary_min: number | null;
  salary_max: number | null;
  work_setups: string[];
  department: string | null;
  location: string | null;
  employment_type: EmploymentType;
  salary_visibility: SalaryVisibility;
  offers_equity: boolean;
  skills: string[];
  responsibilities: string[];
  requirements: string[];
  verified_skill_prefs?: Record<string, "required" | "weighted">;
  screening_enabled?: boolean;
  screening_questions?: ScreeningQuestion[];
  screening_status?: "draft" | "published";
  screening_prefs?: Record<string, "required" | "weighted">;
}

export function JobEditor({
  job,
  publishedAssessmentSkills = [],
}: {
  job: EditableJob | null;
  /** Skills with a PUBLISHED skill-assessment rubric (DESIGN.md §14b, Phase
   * 12) — only these can be set as a required/weighted preference; a draft
   * rubric has no grading power yet. Empty for a not-yet-saved new job
   * (verified_skill_prefs can't be set before the job has an id). */
  publishedAssessmentSkills?: string[];
}) {
  const [title, setTitle] = useState(job?.title ?? "");
  const [department, setDepartment] = useState(job?.department ?? "");
  const [location, setLocation] = useState(job?.location ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(job?.employment_type ?? "fulltime");
  const [salaryMin, setSalaryMin] = useState(job?.salary_min?.toString() ?? "");
  const [salaryMax, setSalaryMax] = useState(job?.salary_max?.toString() ?? "");
  // Stealth ("on_request") is the default for new postings — salary visibility
  // is opt-in-to-public, not opt-out (privacy invariant: hidden by default).
  const [visibility, setVisibility] = useState<SalaryVisibility>(job?.salary_visibility ?? "on_request");
  const [offersEquity, setOffersEquity] = useState(job?.offers_equity ?? false);
  const [workSetups, setWorkSetups] = useState<string[]>(job?.work_setups ?? []);
  const [skillsText, setSkillsText] = useState((job?.skills ?? []).join(", "));
  const [verifiedSkillPrefs, setVerifiedSkillPrefs] = useState<Record<string, "required" | "weighted">>(
    job?.verified_skill_prefs ?? {},
  );
  const [savingVerifiedSkillPrefs, setSavingVerifiedSkillPrefs] = useState(false);
  const [description, setDescription] = useState(job?.description ?? "");
  const [responsibilitiesText, setResponsibilitiesText] = useState(
    (job?.responsibilities ?? []).join("\n"),
  );
  const [requirementsText, setRequirementsText] = useState((job?.requirements ?? []).join("\n"));

  const [suggestions, setSuggestions] = useState<AIDocumentSuggestion[]>([]);
  const [askValue, setAskValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Paste-JD / Generate (Phase 8, DESIGN.md §13b) — suggest-and-approve,
  // same posture as the Refine suggestions above: a draft is never applied
  // to the live form without the recruiter clicking through this preview.
  // A separate transition from `pending` so an in-flight draft fetch doesn't
  // disable the unrelated Save/Publish buttons.
  const [pasteJdOpen, setPasteJdOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [pasteJdText, setPasteJdText] = useState("");
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [draft, setDraft] = useState<JobDraftFields | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [draftPending, startDraftTransition] = useTransition();

  const completion = useMemo(() => {
    const fields = [
      title.trim(),
      location.trim(),
      department.trim(),
      salaryMin.trim() && salaryMax.trim(),
      skillsText.trim(),
      description.trim(),
      responsibilitiesText.trim(),
      requirementsText.trim(),
    ];
    return fields.filter(Boolean).length;
  }, [title, location, department, salaryMin, salaryMax, skillsText, description, responsibilitiesText, requirementsText]);

  function buildFormData() {
    const fd = new FormData();
    if (job) fd.set("id", job.id);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("department", department);
    fd.set("location", location);
    fd.set("employment_type", employmentType);
    fd.set("salary_visibility", visibility);
    fd.set("skills", skillsText);
    fd.set("responsibilities", responsibilitiesText);
    fd.set("requirements", requirementsText);
    fd.set("offers_equity", offersEquity ? "on" : "");
    if (salaryMin) fd.set("salary_min", salaryMin);
    if (salaryMax) fd.set("salary_max", salaryMax);
    workSetups.forEach((s) => fd.append("work_setups", s));
    return fd;
  }

  // Salary is mandatory at posting time (DESIGN §4a) — both bounds required,
  // min <= max. Mirrors the server-side enforcement in saveJob (actions.ts).
  function salaryError(): string | null {
    const min = salaryMin.trim() ? Number(salaryMin) : null;
    const max = salaryMax.trim() ? Number(salaryMax) : null;
    if (min == null || max == null) return "both salary bounds are required";
    if (min > max) return "minimum salary must not exceed maximum";
    return null;
  }

  // refineJobText only takes the JD text itself (no free-text instruction
  // param on the server action) — the quick-action label / ask text drives
  // the suggestion's title in the UI, but is never spliced into the text
  // sent for refinement.
  function refine(suggestionTitle: string) {
    if (!description.trim()) return;
    startTransition(async () => {
      setStatus("Refining JD…");
      const before = description;
      const refined = await refineJobText(before);
      // The rail is 336px wide — truncate the "before" preview (only ever
      // display copy; the full `before` text is never sent anywhere and
      // `after` — what actually gets applied — stays untruncated).
      const beforePreview = before.length > 160 ? `${before.slice(0, 160)}…` : before;
      setSuggestions((prev) => [
        { id: `refine-${Date.now()}`, title: suggestionTitle, before: beforePreview, after: refined, status: "pending" },
        ...prev,
      ]);
      setStatus(null);
    });
  }

  function applySuggestion(id: string) {
    const target = suggestions.find((s) => s.id === id);
    if (!target) return;
    setDescription(target.after);
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "applied" } : s)));
  }

  function dismissSuggestion(id: string) {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "dismissed" } : s)));
  }

  function askAi() {
    if (!askValue.trim()) return;
    refine(askValue.trim());
    setAskValue("");
  }

  function closeDraftDialogs() {
    setPasteJdOpen(false);
    setGenerateOpen(false);
    setDraft(null);
    setDraftError(null);
    setConfirmOverwrite(false);
  }

  function openPasteJdDialog() {
    setDraft(null);
    setDraftError(null);
    setConfirmOverwrite(false);
    setPasteJdOpen(true);
  }

  function openGenerateDialog() {
    setDraft(null);
    setDraftError(null);
    setConfirmOverwrite(false);
    setGenerateOpen(true);
  }

  function submitPasteJd() {
    if (!pasteJdText.trim()) return;
    setDraft(null);
    setDraftError(null);
    setConfirmOverwrite(false);
    startDraftTransition(async () => {
      try {
        setDraft(await extractJobFieldsFromText(pasteJdText));
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : "extraction failed");
      }
    });
  }

  function submitGenerate() {
    if (!generatePrompt.trim()) return;
    setDraft(null);
    setDraftError(null);
    setConfirmOverwrite(false);
    startDraftTransition(async () => {
      try {
        setDraft(await generateJobFromPrompt(generatePrompt));
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : "generation failed");
      }
    });
  }

  // Which form fields a draft would touch, and whether the recruiter already
  // has content there — drives the "don't silently overwrite" confirm below.
  function draftOverlap(d: JobDraftFields) {
    const fields: Array<{ hasDraft: boolean; hasCurrent: boolean }> = [
      { hasDraft: d.title.trim().length > 0, hasCurrent: title.trim().length > 0 },
      { hasDraft: !!d.department?.trim(), hasCurrent: department.trim().length > 0 },
      { hasDraft: d.skills.length > 0, hasCurrent: skillsText.trim().length > 0 },
      { hasDraft: d.responsibilities.length > 0, hasCurrent: responsibilitiesText.trim().length > 0 },
      { hasDraft: d.requirements.length > 0, hasCurrent: requirementsText.trim().length > 0 },
      { hasDraft: d.description.trim().length > 0, hasCurrent: description.trim().length > 0 },
    ];
    return fields.filter((f) => f.hasDraft && f.hasCurrent).length;
  }

  // Suggest-and-approve, per-field: only ever sets a field the draft actually
  // returned non-empty (never blanks a field the recruiter already filled in
  // for a field the draft left empty). If applying would overwrite content
  // already in the form, the first click only arms a confirmation (button
  // label changes) rather than silently clobbering it — a second explicit
  // click is required to proceed.
  function applyDraft() {
    if (!draft) return;
    const overlap = draftOverlap(draft);
    if (overlap > 0 && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    if (draft.title.trim()) setTitle(draft.title.trim());
    if (draft.department?.trim()) setDepartment(draft.department.trim());
    if (draft.skills.length > 0) setSkillsText(draft.skills.join(", "));
    if (draft.responsibilities.length > 0) setResponsibilitiesText(draft.responsibilities.join("\n"));
    if (draft.requirements.length > 0) setRequirementsText(draft.requirements.join("\n"));
    if (draft.description.trim()) setDescription(draft.description.trim());
    closeDraftDialogs();
  }

  // A malformed/truncated Modal response degrades to an all-empty draft
  // (see normalizeJobDraft in modal.ts) rather than a crash — but an empty
  // draft with an enabled Apply button is a dead end for the recruiter
  // (nothing changes, dialog just closes). Detect and message it instead.
  function draftIsEmpty(d: JobDraftFields): boolean {
    return (
      !d.title.trim() &&
      !d.department?.trim() &&
      d.skills.length === 0 &&
      d.responsibilities.length === 0 &&
      d.requirements.length === 0 &&
      !d.description.trim()
    );
  }

  // Shared preview for both the paste-JD and generate dialogs — same
  // data-testid in both so the e2e spec doesn't need to branch per mode.
  function draftPreview() {
    if (!draft) return null;
    if (draftIsEmpty(draft)) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="job-draft-preview">
          Nothing could be extracted from that text — try adding more detail and submitting again.
        </p>
      );
    }
    const overlap = draftOverlap(draft);
    return (
      <div className="max-h-[50vh] space-y-3 overflow-y-auto" data-testid="job-draft-preview">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Title</p>
          <p className="text-sm">{draft.title || "—"}</p>
        </div>
        {draft.department && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Department
            </p>
            <p className="text-sm">{draft.department}</p>
          </div>
        )}
        {draft.skills.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {draft.skills.map((s) => (
                <Badge key={s} variant="secondary" className="text-[12px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {draft.responsibilities.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Responsibilities
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-sm">
              {draft.responsibilities.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {draft.requirements.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Requirements
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-sm">
              {draft.requirements.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {draft.description.trim() && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Description
            </p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.description}</p>
          </div>
        )}
        {overlap > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="job-draft-overwrite-warning">
            Applying will overwrite {overlap} field{overlap === 1 ? "" : "s"} you&apos;ve already filled in.
          </p>
        )}
      </div>
    );
  }

  function saveDraft() {
    const err = salaryError();
    if (err) {
      setStatus(err);
      return;
    }
    startTransition(async () => {
      await saveJob(buildFormData());
      setStatus("Saved.");
    });
  }

  function publish() {
    const err = salaryError();
    if (err) {
      setStatus(err);
      return;
    }
    startTransition(async () => {
      await saveJob(buildFormData());
      if (job) {
        await publishJob(job.id);
        setStatus("Published — matches refreshed.");
      }
    });
  }

  return (
    <div className="jb-fade space-y-6">
      <div className="sticky top-0 z-10 -mx-8 flex items-center justify-between gap-6 border-b border-border bg-background/95 px-8 py-4 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/recruiter/jobs" />}>
            ← Cancel
          </Button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{title.trim() || "Untitled role"}</span>
            <span className="text-xs text-muted-foreground">{completion} of 8 fields complete</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} data-testid="save-job" onClick={saveDraft}>
            Save draft
          </Button>
          {job && job.status !== "closed" && (
            <Button size="sm" disabled={pending} data-testid="publish-job" onClick={publish}>
              {job.status === "active" ? "Re-publish" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <div className="sticky top-16 z-10 -mx-8 px-8 py-4">
        <Card className="border border-secondary bg-secondary/30">
          <CardContent className="space-y-2 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Candidate sees
            </p>
            <div className="space-y-3">
              <div>
                <h3 className="font-heading text-base font-semibold leading-snug text-foreground">
                  {title.trim() || "Job title"}
                </h3>
              </div>
              <div className="text-sm text-muted-foreground">
                {/* salaryDisplay no longer accepts null (bounds NOT NULL since
                    migration 0024); guard the live "Candidate sees" preview —
                    an unfilled range during editing renders "Salary on request". */}
                {salaryMin.trim() && salaryMax.trim()
                  ? salaryDisplay(Number(salaryMin), Number(salaryMax), visibility)
                  : "Salary on request"}
              </div>
              {skillsText.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {skillsText
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-[12px]">
                        {skill}
                      </Badge>
                    ))}
                </div>
              )}
              <div className="text-sm font-medium text-foreground">
                {BAND_LABEL[matchBand(ILLUSTRATIVE_SCORE, "free")]}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!job && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            New posting
          </p>
          <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
            Create a job posting
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Fill in the details below. You can save as a draft and finish later.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Draft with AI:</span>
        <Button variant="outline" size="sm" data-testid="job-paste-jd-open" onClick={openPasteJdDialog}>
          Paste a JD
        </Button>
        <Button variant="outline" size="sm" data-testid="job-generate-open" onClick={openGenerateDialog}>
          Generate with AI
        </Button>
      </div>

      <Dialog open={pasteJdOpen} onOpenChange={(o) => !o && closeDraftDialogs()}>
        <DialogContent data-testid="job-paste-jd-dialog">
          <DialogHeader>
            <DialogTitle>Paste a job description</DialogTitle>
          </DialogHeader>
          {!draft && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Paste an external job description and I&apos;ll pull out the title, skills,
                responsibilities and requirements for you to review.
              </p>
              <Textarea
                data-testid="job-paste-jd-textarea"
                value={pasteJdText}
                onChange={(e) => setPasteJdText(e.target.value)}
                placeholder="Paste the full job description here…"
                rows={10}
              />
              {draftError && <p className="text-sm text-destructive">{draftError}</p>}
            </div>
          )}
          {draft && draftPreview()}
          <DialogFooter>
            {!draft ? (
              <>
                <Button variant="outline" onClick={closeDraftDialogs} disabled={draftPending}>
                  Cancel
                </Button>
                <Button
                  data-testid="job-paste-jd-submit"
                  onClick={submitPasteJd}
                  disabled={draftPending || !pasteJdText.trim()}
                >
                  {draftPending ? "Extracting…" : "Extract fields"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeDraftDialogs}>
                  {draftIsEmpty(draft) ? "Close" : "Discard"}
                </Button>
                {!draftIsEmpty(draft) && (
                  <Button data-testid="job-draft-apply" onClick={applyDraft}>
                    {confirmOverwrite
                      ? `Overwrite ${draftOverlap(draft)} filled field${draftOverlap(draft) === 1 ? "" : "s"}`
                      : "Apply to form"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={(o) => !o && closeDraftDialogs()}>
        <DialogContent data-testid="job-generate-dialog">
          <DialogHeader>
            <DialogTitle>Generate a job posting with AI</DialogTitle>
          </DialogHeader>
          {!draft && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Give me a short prompt — role, team, location — and I&apos;ll draft a full
                posting for you to review and edit.
              </p>
              <Input
                data-testid="job-generate-prompt"
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="e.g. Senior Backend Engineer, fintech, remote"
              />
              {draftError && <p className="text-sm text-destructive">{draftError}</p>}
            </div>
          )}
          {draft && draftPreview()}
          <DialogFooter>
            {!draft ? (
              <>
                <Button variant="outline" onClick={closeDraftDialogs} disabled={draftPending}>
                  Cancel
                </Button>
                <Button
                  data-testid="job-generate-submit"
                  onClick={submitGenerate}
                  disabled={draftPending || !generatePrompt.trim()}
                >
                  {draftPending ? "Generating…" : "Generate draft"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeDraftDialogs}>
                  {draftIsEmpty(draft) ? "Close" : "Discard"}
                </Button>
                {!draftIsEmpty(draft) && (
                  <Button data-testid="job-draft-apply" onClick={applyDraft}>
                    {confirmOverwrite
                      ? `Overwrite ${draftOverlap(draft)} filled field${draftOverlap(draft) === 1 ? "" : "s"}`
                      : "Apply to form"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Basics
          </h2>
          <p className="text-sm text-muted-foreground">The essentials candidates see first.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Job title</Label>
            <Input
              id="title"
              data-testid="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Engineering"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote / Hybrid"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Employment type</Label>
            <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger style={{ width: "100%" }}>
                <SelectValue>{EMPLOYMENT_TYPE_LABEL[employmentType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Work setups</Label>
            <div className="flex gap-3 pt-2">
              {WORK_SETUPS.map((setup) => (
                <label key={setup} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="work_setups"
                    value={setup}
                    checked={workSetups.includes(setup)}
                    onChange={(e) =>
                      setWorkSetups((prev) =>
                        e.target.checked ? [...prev, setup] : prev.filter((s) => s !== setup),
                      )
                    }
                  />
                  {setup}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Salary &amp; visibility
          </h2>
          <p className="text-sm text-muted-foreground">
            Set a range and choose how much of it candidates see.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salary_min">Minimum (USD/yr)</Label>
              <Input
                id="salary_min"
                data-testid="job-salary-min"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="180000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary_max">Maximum (USD/yr)</Label>
              <Input
                id="salary_max"
                data-testid="job-salary-max"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="220000"
              />
            </div>
          </div>

          {/* Explicit 3-way salary visibility control — stealth ('on_request')
              is the default posture (privacy invariant); 'band' and 'public'
              are deliberate, individually-selected opt-ins. A single-click
              cycling toggle would let one click silently escalate disclosure
              (e.g. a band -> public step reached with no deliberate choice of
              'public'), so this is a <select>, not a binary switch. */}
          <div className="space-y-2 rounded-xl bg-muted px-4 py-3.5">
            <Label htmlFor="salary_visibility">Salary visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as SalaryVisibility)}
            >
              <SelectTrigger
                id="salary_visibility"
                data-testid="job-salary-visibility-select"
                style={{ width: "100%" }}
              >
                <SelectValue>{SALARY_VISIBILITY_LABEL[visibility]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="band">Range shown</SelectItem>
                <SelectItem value="on_request">Hidden</SelectItem>
              </SelectContent>
            </Select>
            <span className="block text-[13px] leading-normal text-muted-foreground">
              {SALARY_VISIBILITY_HELP[visibility]}
            </span>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={offersEquity}
              onChange={(e) => setOffersEquity(e.target.checked)}
              data-testid="job-offers-equity"
            />
            This role offers equity
          </label>
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Skills
          </h2>
          <p className="text-sm text-muted-foreground">Used to match candidates to this role.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            data-testid="job-skills"
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="Node.js, PostgreSQL, AWS, System Design"
            rows={3}
          />
          {skillsText.trim() && (
            <div className="flex flex-wrap gap-2">
              {skillsText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Separate skills with commas.</p>
        </CardContent>
      </Card>

      {job && publishedAssessmentSkills.length > 0 && (
        <Card className="jb-lift" data-testid="verified-skills-card">
          <CardHeader>
            <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Verified skills
            </h2>
            <p className="text-sm text-muted-foreground">
              &quot;Required&quot; excludes a candidate entirely unless they&apos;ve passed that
              skill&apos;s assessment. &quot;Weighted&quot; gives a small ranking boost to those
              who have — never a hard filter.{" "}
              <Link href="/recruiter/skill-assessments" className="underline">
                Manage assessments
              </Link>
              .
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {skillsText
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s && publishedAssessmentSkills.includes(s))
              .map((skill) => {
                const pref = verifiedSkillPrefs[skill];
                async function setPref(next: "required" | "weighted" | null) {
                  const updated = { ...verifiedSkillPrefs };
                  if (next) updated[skill] = next;
                  else delete updated[skill];
                  setVerifiedSkillPrefs(updated);
                  if (!job) return;
                  setSavingVerifiedSkillPrefs(true);
                  try {
                    await updateVerifiedSkillPrefs(job.id, updated);
                  } finally {
                    setSavingVerifiedSkillPrefs(false);
                  }
                }
                return (
                  <div key={skill} className="flex items-center justify-between gap-3" data-testid="verified-skill-row">
                    <span className="text-sm">{skill}</span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant={pref === "required" ? "default" : "outline"}
                        disabled={savingVerifiedSkillPrefs}
                        onClick={() => setPref(pref === "required" ? null : "required")}
                        data-testid={`verified-skill-required-${skill}`}
                      >
                        Required
                      </Button>
                      <Button
                        size="sm"
                        variant={pref === "weighted" ? "default" : "outline"}
                        disabled={savingVerifiedSkillPrefs}
                        onClick={() => setPref(pref === "weighted" ? null : "weighted")}
                        data-testid={`verified-skill-weighted-${skill}`}
                      >
                        Weighted
                      </Button>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      <ScreeningQuestionsPanel
        jobId={job?.id ?? null}
        jobDescription={description}
        initialEnabled={job?.screening_enabled ?? false}
        initialQuestions={job?.screening_questions ?? []}
        initialStatus={job?.screening_status ?? "draft"}
        initialPrefs={job?.screening_prefs ?? {}}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            About the role
          </h2>
          <p className="text-sm text-muted-foreground">A short summary of what this person will own.</p>
        </div>
        <AIDocumentCanvas
          canvasTitle="Job post canvas"
          docText={description}
          onDocTextChange={setDescription}
          docPlaceholder="Describe the team, the mission, and what success looks like…"
          docTestId="job-description"
          introText={
            suggestions.some((s) => s.status === "pending")
              ? "Apply a suggestion below, or ask for something specific."
              : "I can tighten this JD, sharpen impact language, or match your team's tone — try a quick action or ask for something specific."
          }
          quickActions={JD_QUICK_ACTIONS}
          onQuickAction={refine}
          suggestions={suggestions}
          onApplySuggestion={applySuggestion}
          onDismissSuggestion={dismissSuggestion}
          askValue={askValue}
          onAskChange={setAskValue}
          onAskSubmit={askAi}
          askPlaceholder="Ask AI to rewrite…"
          saved={status === "Saved."}
          busy={pending}
          askTestId="job-description-ask"
          sendTestId="job-description-ask-send"
        />
      </div>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            What they&apos;ll do
          </h2>
          <p className="text-sm text-muted-foreground">One responsibility per line.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            data-testid="job-responsibilities"
            value={responsibilitiesText}
            onChange={(e) => setResponsibilitiesText(e.target.value)}
            placeholder={"Own the payments ledger service\nScale core services\nPartner with product and infra"}
            rows={5}
          />
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Requirements
          </h2>
          <p className="text-sm text-muted-foreground">One requirement per line.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            data-testid="job-requirements"
            value={requirementsText}
            onChange={(e) => setRequirementsText(e.target.value)}
            placeholder={"6+ years building backend services\nExperience with distributed systems\nStrong PostgreSQL and AWS"}
            rows={5}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">{completion} of 8 fields complete</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={pending} onClick={saveDraft}>
            Save draft
          </Button>
          {job && job.status !== "closed" && (
            <>
              <Button size="lg" disabled={pending} onClick={publish}>
                {job.status === "active" ? "Re-publish & refresh matches" : "Publish posting"}
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => startTransition(() => closeJob(job.id))}>
                Close job
              </Button>
            </>
          )}
        </div>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {job && (
        <Button
          variant="secondary"
          data-testid="view-matches"
          render={<Link href={`/recruiter/jobs/${job.id}/matches`} />}
        >
          View matches →
        </Button>
      )}
    </div>
  );
}
