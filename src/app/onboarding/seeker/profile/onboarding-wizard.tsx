"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  extractOnboardingFields,
  publishProfile,
  saveDraft,
  saveExperience,
} from "@/app/seeker/actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

export interface OnboardingExperienceRow {
  role: string;
  company: string;
  industry: string | null;
  startDate: string;
  endDate: string | null;
}

interface Props {
  draftText: string;
  skills: string[];
  desiredRoles: string[];
  industries: string[];
  experience: OnboardingExperienceRow[];
  minSalary: number | null;
  workSetups: string[];
}

function TagList({
  label,
  values,
  onRemove,
  onAdd,
  placeholder,
  testId,
}: {
  label: string;
  values: string[];
  onRemove: (v: string) => void;
  onAdd: (v: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2" data-testid={testId}>
        {values.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing extracted — add some below.</p>
        )}
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(v)}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onAdd(draft.trim());
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!draft.trim()}
          onClick={() => {
            if (!draft.trim()) return;
            onAdd(draft.trim());
            setDraft("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/** Step 2-3 of the resume-first onboarding wizard (DESIGN.md §2c): resume
 * upload/paste as the primary action, AI extraction shown as suggest-and-
 * approve cards (skills/roles/industries/experience — each approve/edit/
 * remove, plus "add manually"), then dealbreakers, then publish. Reuses the
 * existing saveDraft/saveExperience/publishProfile server actions unchanged
 * — only the extraction + approval UI is new. */
export function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"resume" | "dealbreakers">("resume");
  const [rawText, setRawText] = useState(props.draftText);
  const [extracted, setExtracted] = useState(props.draftText.trim().length > 0);
  const [skills, setSkills] = useState<string[]>(props.skills);
  const [roles, setRoles] = useState<string[]>(props.desiredRoles);
  const [industries, setIndustries] = useState<string[]>(props.industries);
  const [experience, setExperience] = useState<OnboardingExperienceRow[]>(props.experience);
  const [minSalary, setMinSalary] = useState(props.minSalary?.toString() ?? "");
  const [workSetups, setWorkSetups] = useState<string[]>(props.workSetups);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadResume(file: File) {
    setStatus("Extracting text…");
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/ingest", { method: "POST", body });
    if (!res.ok) {
      setStatus(`Upload failed: ${(await res.json().catch(() => null))?.error ?? res.status}`);
      return;
    }
    const { text } = (await res.json()) as { text: string };
    setRawText(text);
    await runExtraction(text);
  }

  function runExtraction(text: string) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        setStatus("Reading your resume for skills, roles and experience…");
        const fields = await extractOnboardingFields(text);
        setSkills((prev) => [...new Set([...prev, ...fields.skills])]);
        setRoles((prev) => [...new Set([...prev, ...fields.roles])]);
        setIndustries((prev) => [...new Set([...prev, ...fields.industries])]);
        setExperience((prev) => [...prev, ...fields.experience]);
        setExtracted(true);
        setStatus("Extracted — review what we found below, then continue.");
        resolve();
      });
    });
  }

  function updateExperienceRow(i: number, patch: Partial<OnboardingExperienceRow>) {
    setExperience((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeExperienceRow(i: number) {
    setExperience((rows) => rows.filter((_, idx) => idx !== i));
  }
  function addExperienceRow() {
    setExperience((rows) => [
      ...rows,
      { role: "", company: "", industry: null, startDate: "", endDate: null },
    ]);
  }

  function buildFormData() {
    const fd = new FormData();
    fd.set("draft_text", rawText);
    fd.set("skills", skills.join(", "));
    fd.set("desired_roles", roles.join(", "));
    fd.set("industries", industries.join(", "));
    if (minSalary) fd.set("min_salary", minSalary);
    workSetups.forEach((s) => fd.append("work_setups", s));
    return fd;
  }

  function continueToDealbreakers() {
    startTransition(async () => {
      await saveDraft(buildFormData());
      await saveExperience(experience);
      setStep("dealbreakers");
    });
  }

  function finish() {
    startTransition(async () => {
      await saveDraft(buildFormData());
      await publishProfile();
      router.push("/seeker");
    });
  }

  if (step === "dealbreakers") {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Dealbreakers</CardTitle>
          <CardDescription>Step 3 of 3 — matches that don&apos;t clear these never surface.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min_salary">Minimum base salary (USD)</Label>
            <Input
              id="min_salary"
              data-testid="onboarding-min-salary"
              type="number"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
              placeholder="e.g. 90000"
            />
          </div>
          <div className="space-y-2">
            <Label>Acceptable work setups</Label>
            <div className="flex gap-4">
              {WORK_SETUPS.map((setup) => (
                <label key={setup} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
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
          <div className="flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setStep("resume")}>
              Back
            </Button>
            <Button
              className="flex-1"
              data-testid="onboarding-finish"
              disabled={pending || !rawText.trim()}
              onClick={finish}
            >
              Finish — publish my profile
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Your resume</CardTitle>
        <CardDescription>
          Step 2 of 3 — upload or paste your resume. Recruiters only ever see a redacted,
          skills-based profile; we only file what your resume says, we never invent experience.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadResume(f);
            }}
          />
          <Button
            data-testid="onboarding-upload-resume"
            disabled={pending}
            onClick={() => fileInput.current?.click()}
          >
            Upload resume PDF
          </Button>
          <Button
            variant="outline"
            disabled={pending || !rawText.trim()}
            onClick={() => runExtraction(rawText)}
            data-testid="onboarding-extract"
          >
            Extract from pasted text
          </Button>
        </div>

        <Textarea
          data-testid="onboarding-resume-paste"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          placeholder="Or paste your resume text here…"
        />

        {status && <p className="text-sm text-muted-foreground">{status}</p>}

        {extracted && (
          <>
            <TagList
              label="Skills"
              values={skills}
              onRemove={(v) => setSkills((s) => s.filter((x) => x !== v))}
              onAdd={(v) => setSkills((s) => [...new Set([...s, v])])}
              placeholder="Add a skill"
              testId="onboarding-skills"
            />
            <TagList
              label="Roles you're targeting"
              values={roles}
              onRemove={(v) => setRoles((s) => s.filter((x) => x !== v))}
              onAdd={(v) => setRoles((s) => [...new Set([...s, v])])}
              placeholder="Add a target role"
              testId="onboarding-roles"
            />
            <TagList
              label="Industries"
              values={industries}
              onRemove={(v) => setIndustries((s) => s.filter((x) => x !== v))}
              onAdd={(v) => setIndustries((s) => [...new Set([...s, v])])}
              placeholder="Add an industry"
              testId="onboarding-industries"
            />

            <div className="space-y-3">
              <Label>Work experience</Label>
              {experience.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] items-end gap-2"
                  data-testid="onboarding-experience-row"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Input value={row.role} onChange={(e) => updateExperienceRow(i, { role: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company</Label>
                    <Input
                      value={row.company}
                      onChange={(e) => updateExperienceRow(i, { company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Industry</Label>
                    <Input
                      value={row.industry ?? ""}
                      onChange={(e) => updateExperienceRow(i, { industry: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input
                      type="date"
                      value={row.startDate}
                      onChange={(e) => updateExperienceRow(i, { startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End (blank = present)</Label>
                    <Input
                      type="date"
                      value={row.endDate ?? ""}
                      onChange={(e) => updateExperienceRow(i, { endDate: e.target.value || null })}
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeExperienceRow(i)}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addExperienceRow}>
                Add role manually
              </Button>
            </div>
          </>
        )}

        {!extracted && (
          <Button variant="ghost" size="sm" onClick={() => setExtracted(true)}>
            Skip upload — add skills and experience manually
          </Button>
        )}

        <div className="flex justify-end">
          <Button
            data-testid="onboarding-continue-dealbreakers"
            disabled={pending || !rawText.trim() || !extracted}
            onClick={continueToDealbreakers}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
