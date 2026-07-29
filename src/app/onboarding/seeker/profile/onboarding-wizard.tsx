"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
} from "@jumponboard/ui";
import {
  extractOnboardingFields,
  publishProfile,
  saveDraft,
  saveExperience,
} from "@/app/(app)/seeker/actions";
import { describePiiCategories, stripPiiPatterns, type PiiCategory } from "@/lib/pii-patterns";
import { OnboardingChrome } from "../onboarding-chrome";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

export interface OnboardingExperienceRow {
  role: string;
  company: string;
  industry: string | null;
  startDate: string;
  endDate: string | null;
}

type Category = "Skills" | "Roles" | "Industries";
const CATEGORY_SINGULAR: Record<Category | "Experience", string> = {
  Skills: "Skill",
  Roles: "Role",
  Industries: "Industry",
  Experience: "Experience",
};

interface TextItem {
  id: number;
  category: Category;
  text: string;
  status: "pending" | "approved";
  editing: boolean;
  draft: string;
}

interface ExperienceItem {
  id: number;
  row: OnboardingExperienceRow;
  status: "pending" | "approved";
  editing: boolean;
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

function ItemCard({
  item,
  onPatch,
  onRemove,
}: {
  item: TextItem;
  onPatch: (id: number, patch: Partial<TextItem>) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <Card size="sm">
      <CardContent>
        {item.editing ? (
          <div className="flex items-center gap-2">
            <Input value={item.draft} onChange={(e) => onPatch(item.id, { draft: e.target.value })} />
            <Button
              size="sm"
              onClick={() => onPatch(item.id, { text: item.draft, editing: false, status: "approved" })}
            >
              Save
            </Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2 text-sm">
              {item.text}
              <Badge variant={item.status === "approved" ? "default" : "secondary"}>
                {item.status === "approved" ? "Approved" : "Review"}
              </Badge>
            </div>
            <div className="flex flex-none gap-1.5">
              <Button
                variant="outline"
                size="sm"
                aria-label={`Approve ${item.text}`}
                onClick={() => onPatch(item.id, { status: "approved" })}
              >
                ✓
              </Button>
              <Button variant="outline" size="sm" onClick={() => onPatch(item.id, { editing: true })}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${item.text}`}
                onClick={() => onRemove(item.id)}
              >
                ✕
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemGroup({
  label,
  items,
  testId,
  onPatch,
  onRemove,
}: {
  label: string;
  items: TextItem[];
  testId: string;
  onPatch: (id: number, patch: Partial<TextItem>) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing extracted — add below.</p>
      )}
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onPatch={onPatch} onRemove={onRemove} />
      ))}
    </div>
  );
}

function experienceLabel(row: OnboardingExperienceRow): string {
  const year = (d: string) => (d ? new Date(d).getFullYear() : "");
  const dates = row.startDate ? ` (${year(row.startDate)}–${row.endDate ? year(row.endDate) : "present"})` : "";
  return `${row.role || "Role"}, ${row.company || "Company"}${dates}`;
}

/** Steps 2-3 of the resume-first onboarding wizard (SeekerOnboarding
 * template): resume upload/paste, AI extraction as suggest-and-approve item
 * cards (approve/edit/remove + add-manually), then dealbreakers, then
 * publish. Experience items stay structured (dates feed the tenure/seniority
 * signals) — the template's free-text line is only the display form. */
export function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"resume" | "dealbreakers">("resume");
  const [rawText, setRawText] = useState(props.draftText);
  const [sourceName, setSourceName] = useState<string | null>(
    props.draftText.trim() ? "Saved draft" : null,
  );
  // Seed both item lists (and the id counter's starting point) in ONE lazy
  // initializer using a local counter — mutating a ref inside useState
  // initializers reads/writes the ref during render (react-hooks/refs).
  const [initialSeed] = useState(() => {
    let id = 1;
    const seed = (values: string[], category: Category): TextItem[] =>
      values.map((text) => ({
        id: id++,
        category,
        text,
        status: "approved" as const,
        editing: false,
        draft: text,
      }));
    const items = [
      ...seed(props.skills, "Skills"),
      ...seed(props.desiredRoles, "Roles"),
      ...seed(props.industries, "Industries"),
    ];
    const expItems: ExperienceItem[] = props.experience.map((row) => ({
      id: id++,
      row,
      status: "approved" as const,
      editing: false,
    }));
    return { items, expItems, nextId: id };
  });
  const nextId = useRef(initialSeed.nextId);
  const [items, setItems] = useState<TextItem[]>(initialSeed.items);
  const [expItems, setExpItems] = useState<ExperienceItem[]>(initialSeed.expItems);
  const [extracted, setExtracted] = useState(props.draftText.trim().length > 0);
  const [newCategory, setNewCategory] = useState<Category | "Experience">("Skills");
  const [newText, setNewText] = useState("");
  const [minSalary, setMinSalary] = useState(props.minSalary?.toString() ?? "");
  const [workSetups, setWorkSetups] = useState<string[]>(props.workSetups);
  const [status, setStatus] = useState<string | null>(null);
  const [piiNote, setPiiNote] = useState<string | null>(null);
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
    const { text, piiFound } = (await res.json()) as { text: string; piiFound?: PiiCategory[] };
    // PDF path (DESIGN.md §2f Layer 0): identifiers were stripped at our
    // edge AFTER upload — honest copy, never a "never left your device"
    // claim (the raw file is stored owner-only, metadata-stripped).
    setPiiNote(
      piiFound && piiFound.length > 0
        ? `We removed ${describePiiCategories(piiFound)} from your draft after upload. Your original file stays private to you.`
        : null,
    );
    setRawText(text);
    await runExtraction(text, file.name);
  }

  /** Paste path (DESIGN.md §2f Layer 0): deterministic contact-identifier
   * strip runs HERE, in the browser, before the text is sent anywhere —
   * for this path "removed before leaving your device" is literally true. */
  function extractFromPaste() {
    const { text, found } = stripPiiPatterns(rawText);
    setPiiNote(
      found.length > 0
        ? `We removed ${describePiiCategories(found)} before your text left this device.`
        : null,
    );
    setRawText(text);
    void runExtraction(text, "Pasted text");
  }

  function runExtraction(text: string, source: string) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        setStatus("Reading your resume for skills, roles and experience…");
        const fields = await extractOnboardingFields(text);
        const add = (values: string[], category: Category) =>
          values
            .filter((v) => !items.some((i) => i.category === category && i.text === v))
            .map((text) => ({
              id: nextId.current++,
              category,
              text,
              status: "pending" as const,
              editing: false,
              draft: text,
            }));
        setItems((prev) => [
          ...prev,
          ...add(fields.skills, "Skills"),
          ...add(fields.roles, "Roles"),
          ...add(fields.industries, "Industries"),
        ]);
        setExpItems((prev) => [
          ...prev,
          ...fields.experience.map((row) => ({
            id: nextId.current++,
            row,
            status: "pending" as const,
            editing: false,
          })),
        ]);
        setSourceName(source);
        setExtracted(true);
        setStatus(null);
        resolve();
      });
    });
  }

  function itemsOf(category: Category) {
    return items.filter((i) => i.category === category);
  }

  function patchItem(id: number, patch: Partial<TextItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function patchExp(id: number, patch: Partial<ExperienceItem>) {
    setExpItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function patchExpRow(id: number, patch: Partial<OnboardingExperienceRow>) {
    setExpItems((prev) => prev.map((i) => (i.id === id ? { ...i, row: { ...i.row, ...patch } } : i)));
  }

  function addManual() {
    const text = newText.trim();
    if (!text) return;
    if (newCategory === "Experience") {
      setExpItems((prev) => [
        ...prev,
        {
          id: nextId.current++,
          row: { role: text, company: "", industry: null, startDate: "", endDate: null },
          status: "approved",
          editing: true,
        },
      ]);
    } else {
      setItems((prev) => [
        ...prev,
        { id: nextId.current++, category: newCategory, text, status: "approved", editing: false, draft: text },
      ]);
    }
    setNewText("");
  }

  function buildFormData() {
    const fd = new FormData();
    fd.set("draft_text", rawText);
    fd.set("skills", itemsOf("Skills").map((i) => i.text).join(", "));
    fd.set("desired_roles", itemsOf("Roles").map((i) => i.text).join(", "));
    fd.set("industries", itemsOf("Industries").map((i) => i.text).join(", "));
    if (minSalary) fd.set("min_salary", minSalary);
    workSetups.forEach((s) => fd.append("work_setups", s));
    return fd;
  }

  function persist() {
    return Promise.all([saveDraft(buildFormData()), saveExperience(expItems.map((i) => i.row))]);
  }

  function continueToDealbreakers() {
    startTransition(async () => {
      await persist();
      setStep("dealbreakers");
    });
  }

  function finish() {
    startTransition(async () => {
      await persist();
      await publishProfile();
      router.push("/seeker");
    });
  }

  if (step === "dealbreakers") {
    return (
      <OnboardingChrome current={3} skipHref="/seeker">
        <Card>
          <CardHeader>
            <CardTitle>Your dealbreakers</CardTitle>
            <CardDescription>We&apos;ll only surface roles that clear these bars.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="min_salary">Minimum base salary (USD)</Label>
              <Input
                id="min_salary"
                data-testid="onboarding-min-salary"
                type="number"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="e.g. 90000"
              />
              <p className="text-xs text-muted-foreground">
                Shared with recruiters only if you opt in — never shown publicly.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Work setup</Label>
              <div className="flex gap-4">
                {WORK_SETUPS.map((setup) => (
                  <label key={setup} className="flex items-center gap-1.5 text-sm capitalize">
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
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </CardContent>
          <CardFooter className="flex gap-2.5">
            <Button variant="outline" disabled={pending} onClick={() => setStep("resume")}>
              Back
            </Button>
            <Button
              className="flex-1"
              data-testid="onboarding-finish"
              disabled={pending || !rawText.trim()}
              onClick={finish}
            >
              Finish &amp; publish profile
            </Button>
          </CardFooter>
        </Card>
      </OnboardingChrome>
    );
  }

  return (
    <OnboardingChrome current={2} skipHref="/seeker">
      <Card>
        <CardHeader>
          <CardTitle>Add your resume</CardTitle>
          <CardDescription>
            PDF upload or pasted text — this is the primary way we build your profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {!extracted ? (
            <>
              <button
                type="button"
                data-testid="onboarding-upload-resume"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-border px-5 py-9 text-center"
              >
                <span className="text-sm font-semibold">
                  Drop your resume PDF here, or click to browse
                </span>
                <span className="text-[13px] text-muted-foreground">Also accepts pasted plain text</span>
                <span className="rounded-md border px-3 py-1.5 text-sm">Choose file</span>
              </button>
              <div className="space-y-1.5">
                <Label htmlFor="ob-paste">Or paste resume text</Label>
                <Textarea
                  id="ob-paste"
                  data-testid="onboarding-resume-paste"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={5}
                  placeholder="Paste the text of your resume here…"
                />
              </div>
              <Button
                className="w-full"
                data-testid="onboarding-extract"
                disabled={pending || !rawText.trim()}
                onClick={extractFromPaste}
              >
                Extract from text
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2.5 rounded-[10px] border border-border px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-sm">
                    📄
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold">{sourceName}</span>
                    <span className="text-xs text-muted-foreground">Parsed and ready for review</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setExtracted(false);
                    setSourceName(null);
                  }}
                >
                  Replace
                </Button>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">
                  AI extracted the following — review before saving
                </span>
                <span className="text-[13px] text-muted-foreground">
                  We only file what your resume says — we never invent experience.
                </span>
              </div>

              <ItemGroup label="Skills" items={itemsOf("Skills")} testId="onboarding-skills" onPatch={patchItem} onRemove={removeItem} />
              <ItemGroup label="Roles" items={itemsOf("Roles")} testId="onboarding-roles" onPatch={patchItem} onRemove={removeItem} />
              <ItemGroup label="Industries" items={itemsOf("Industries")} testId="onboarding-industries" onPatch={patchItem} onRemove={removeItem} />

              <div className="flex flex-col gap-2" data-testid="onboarding-experience">
                <span className="text-xs text-muted-foreground">Work experience</span>
                {expItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nothing extracted — add below.</p>
                )}
                {expItems.map((item) => (
                  <Card key={item.id} size="sm" data-testid="onboarding-experience-row">
                    <CardContent>
                      {item.editing ? (
                        <div className="flex flex-col gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              aria-label="Role"
                              placeholder="Role"
                              value={item.row.role}
                              onChange={(e) => patchExpRow(item.id, { role: e.target.value })}
                            />
                            <Input
                              aria-label="Company"
                              placeholder="Company"
                              value={item.row.company}
                              onChange={(e) => patchExpRow(item.id, { company: e.target.value })}
                            />
                            <Input
                              aria-label="Start date"
                              type="date"
                              value={item.row.startDate}
                              onChange={(e) => patchExpRow(item.id, { startDate: e.target.value })}
                            />
                            <Input
                              aria-label="End date (blank = present)"
                              type="date"
                              value={item.row.endDate ?? ""}
                              onChange={(e) => patchExpRow(item.id, { endDate: e.target.value || null })}
                            />
                          </div>
                          <Button
                            size="sm"
                            className="self-end"
                            onClick={() => patchExp(item.id, { editing: false, status: "approved" })}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2 text-sm leading-snug">
                            {experienceLabel(item.row)}
                            <Badge variant={item.status === "approved" ? "default" : "secondary"}>
                              {item.status === "approved" ? "Approved" : "Review"}
                            </Badge>
                          </div>
                          <div className="flex flex-none gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Approve experience"
                              onClick={() => patchExp(item.id, { status: "approved" })}
                            >
                              ✓
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => patchExp(item.id, { editing: true })}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Remove experience"
                              onClick={() => setExpItems((prev) => prev.filter((i) => i.id !== item.id))}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">Add manually</span>
                <div className="flex gap-2">
                  <Select value={newCategory} onValueChange={(v) => setNewCategory(v as Category | "Experience")}>
                    <SelectTrigger style={{ width: 140 }}>
                      <SelectValue>{CATEGORY_SINGULAR[newCategory]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Skills">Skill</SelectItem>
                      <SelectItem value="Roles">Role</SelectItem>
                      <SelectItem value="Industries">Industry</SelectItem>
                      <SelectItem value="Experience">Experience</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="e.g. Terraform"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addManual();
                      }
                    }}
                  />
                  <Button variant="outline" disabled={!newText.trim()} onClick={addManual}>
                    Add
                  </Button>
                </div>
              </div>
            </>
          )}

          {piiNote && (
            <p className="text-[13px] leading-normal text-muted-foreground" data-testid="pii-preview-note">
              {piiNote}
            </p>
          )}
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </CardContent>
        <CardFooter className="flex gap-2.5">
          <Button
            className="flex-1"
            data-testid="onboarding-continue-dealbreakers"
            disabled={pending || !rawText.trim() || !extracted}
            onClick={continueToDealbreakers}
          >
            Continue
          </Button>
        </CardFooter>
      </Card>
    </OnboardingChrome>
  );
}
