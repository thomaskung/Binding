"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  AIDocumentCanvas,
  type AIDocumentSuggestion,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@binding/ui";
import { encryptBytes, encryptText } from "@/lib/crypto/envelope";
import { getSessionDataKey } from "@/lib/crypto/session-key";
import type { DriveFile } from "@/lib/google-drive";
import { PROFILE_QUICK_ACTIONS } from "@/lib/profile";
import { getWrappedDataKey, storeEncryptedResume } from "../../key-custody-actions";
import { publishProfile, refineProfileText, saveDraftText } from "../../actions";
import { ResumeExportModal } from "./resume-export-modal";

interface Props {
  draftText: string;
  redactedText: string | null;
  /** Whether a connected_accounts row already exists for this seeker
   * (migration 0026) — gates the "Browse Google Drive" entry point below. */
  driveConnected: boolean;
  /** Whether this seeker has enrolled passkey-based resume encryption
   * (DESIGN.md §2g Phase 10, `user_data_keys` row exists). Opt-in — a
   * seeker who hasn't enrolled gets the unchanged plaintext upload flow. */
  encryptionEnabled: boolean;
  seekerTier: "free" | "pro";
  displayName: string;
  headline: string | null;
  skills: string[];
  desiredRoles: string[];
  industries: string[];
  experience: Array<{
    role: string;
    company: string;
    startDate: string;
    endDate: string | null;
    industry: string | null;
  }>;
}

interface DraftSuggestion {
  id: string;
  title: string;
  before: string;
  after: string;
}

/** Resume editor canvas (the NavShell template's Profile surface): the
 * AIDocumentCanvas paper-surface + AI rail (JobOnBoardUI "Résumé canvas"
 * template) wrapping the same suggest-and-approve wiring as before — quick
 * actions for everyone, free-text Ask AI for Pro only (server-enforced tier
 * gate + rate limit in refineProfileText; the ask box itself is inert for
 * free tier — no client-side round trip is even attempted), Apply/Dismiss
 * review of one AI suggestion at a time, explicit Save/Publish. Publishing
 * re-runs redact → embed → match. */
export function ResumeCanvas(props: Props) {
  const [draft, setDraft] = useState(props.draftText);
  const [suggestion, setSuggestion] = useState<DraftSuggestion | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [importingFileId, setImportingFileId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPro = props.seekerTier === "pro";

  function flashSaved() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }

  /** Plaintext path (unchanged from before Phase 10) — the default for any
   * seeker who hasn't enrolled passkey encryption. */
  async function uploadResumePlaintext(file: File) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/ingest", { method: "POST", body });
    if (!res.ok) {
      setStatus(`Upload failed: ${(await res.json().catch(() => null))?.error ?? res.status}`);
      return;
    }
    const { text } = (await res.json()) as { text: string };
    setDraft(text);
    setStatus("Resume text extracted — review below, then publish.");
  }

  /** Encrypted path (DESIGN.md §2g Phase 10): the server does the same
   * transient text extraction as the plaintext path but persists nothing —
   * it hands the extraction back for this browser to encrypt with its own
   * unwrapped DEK before the SECOND call persists only ciphertext.
   *
   * NOTE this only protects `resumes` (the raw original artifact) — `draft`
   * below still gets saved to `profiles.draft_text` in plaintext via the
   * normal Save button (`saveDraftText`), same as the unencrypted path,
   * because `publishProfile` reads `draft_text` for redaction/embedding and
   * that pipeline is out of scope for this phase (founder-confirmed, see
   * DESIGN.md §2g's built-note). */
  async function uploadResumeEncrypted(file: File) {
    const dek = await getSessionDataKey(getWrappedDataKey);
    if (!dek) {
      setStatus(
        "Couldn't unlock your resume encryption key (passkey ceremony declined or unsupported here) — try again or use a device with your enrolled passkey.",
      );
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("encrypt", "true");
    const res = await fetch("/api/ingest", { method: "POST", body });
    if (!res.ok) {
      setStatus(`Upload failed: ${(await res.json().catch(() => null))?.error ?? res.status}`);
      return;
    }
    const { text, rawText, strippedPdfBase64 } = (await res.json()) as {
      text: string;
      rawText: string;
      strippedPdfBase64: string;
    };

    const pdfBytes = Uint8Array.from(atob(strippedPdfBase64), (c) => c.charCodeAt(0));
    const [encryptedRawTextB64, encryptedPdfB64] = await Promise.all([
      encryptText(dek, rawText),
      encryptBytes(dek, pdfBytes),
    ]);
    await storeEncryptedResume({ encryptedRawTextB64, encryptedPdfB64 });

    setDraft(text);
    setStatus("Resume text extracted and encrypted — review below, then publish.");
  }

  async function uploadResume(file: File) {
    setStatus("Extracting text…");
    if (props.encryptionEnabled) {
      await uploadResumeEncrypted(file);
    } else {
      await uploadResumePlaintext(file);
    }
  }

  /** Opens the Drive dialog and lists recent PDF/Doc files (plain
   * list-and-pick — no Picker API, see src/lib/google-drive.ts). */
  async function openDriveDialog() {
    setDriveDialogOpen(true);
    setDriveError(null);
    setDriveLoading(true);
    try {
      const res = await fetch("/api/connected-accounts/google-drive/files");
      const json = (await res.json().catch(() => null)) as
        | { files: DriveFile[] }
        | { error: string }
        | null;
      if (!res.ok || !json || "error" in json) {
        setDriveError(json && "error" in json ? json.error : `Drive request failed (${res.status})`);
        setDriveFiles([]);
      } else {
        setDriveFiles(json.files);
      }
    } catch {
      setDriveError("Could not reach Google Drive.");
      setDriveFiles([]);
    } finally {
      setDriveLoading(false);
    }
  }

  async function importDriveFile(file: DriveFile) {
    setImportingFileId(file.id);
    setDriveError(null);
    try {
      const res = await fetch("/api/connected-accounts/google-drive/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: file.id, mimeType: file.mimeType }),
      });
      const json = (await res.json().catch(() => null)) as { text: string } | { error: string } | null;
      if (!res.ok || !json || "error" in json) {
        setDriveError(json && "error" in json ? json.error : `Import failed (${res.status})`);
        return;
      }
      setDraft(json.text);
      setDriveDialogOpen(false);
      setStatus(`Imported "${file.name}" from Google Drive — review below, then publish.`);
    } catch {
      setDriveError("Could not reach Google Drive.");
    } finally {
      setImportingFileId(null);
    }
  }

  function refine(instruction: string | undefined, title: string) {
    startTransition(async () => {
      setStatus("Asking the AI for a refinement…");
      try {
        const refined = await refineProfileText(draft, instruction);
        setSuggestion({ id: `sug-${Date.now()}`, title, before: draft, after: refined });
        setStatus(null);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Refinement failed.");
      }
    });
  }

  function persistDraft(thenPublish: boolean) {
    startTransition(async () => {
      await saveDraftText(draft);
      if (thenPublish) {
        await publishProfile();
        setStatus("Published — your redacted profile is live in the pool.");
      } else {
        setStatus("Draft saved.");
        flashSaved();
      }
    });
  }

  const suggestions: AIDocumentSuggestion[] = suggestion
    ? [
        {
          id: suggestion.id,
          title: suggestion.title,
          before: suggestion.before,
          after: suggestion.after,
          status: "pending",
        },
      ]
    : [];

  const introText = suggestion
    ? "Here's a suggested rewrite, grounded in what you wrote — apply it, or ask for something different."
    : draft.trim()
      ? "Try a quick action below, or ask for something specific."
      : "Paste or write your resume, then ask AI to tighten it up.";

  return (
    <div className="jb-fade mx-auto max-w-[1040px] space-y-5 px-5 py-8">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <h1 className="font-heading text-[26px] font-medium tracking-tight">Resume</h1>
          <Badge variant="outline">Seeker</Badge>
          {isPro && <Badge variant="outline">Pro</Badge>}
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Edit your resume live — ask AI for changes, approve before they apply.
          </p>
          <span className="flex-none text-xs text-muted-foreground">
            {status ?? "Edits are drafts until you publish"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          Upload resume PDF
        </Button>
        {props.driveConnected ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="browse-google-drive"
            onClick={() => void openDriveDialog()}
          >
            Browse Google Drive
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              data-testid="drive-connect-hint"
              render={<Link href="/seeker/profile" />}
            >
              Connect Google Drive
            </Button>{" "}
            to import from there
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setExportModalOpen(true)}
            data-testid="export-button"
          >
            Export
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => persistDraft(false)}>
            Save draft
          </Button>
          <Button
            size="sm"
            data-testid="publish-profile"
            disabled={pending || !draft.trim()}
            onClick={() => persistDraft(true)}
          >
            Publish to pool
          </Button>
        </div>
      </div>

      <AIDocumentCanvas
        canvasTitle="Résumé canvas"
        docText={draft}
        onDocTextChange={setDraft}
        introText={introText}
        quickActions={PROFILE_QUICK_ACTIONS.map((a) => a.label)}
        onQuickAction={(label) => {
          const action = PROFILE_QUICK_ACTIONS.find((a) => a.label === label);
          if (action && draft.trim() && !pending) refine(action.instruction, action.label);
        }}
        suggestions={suggestions}
        onApplySuggestion={(id) => {
          if (suggestion && suggestion.id === id) setDraft(suggestion.after);
          setSuggestion(null);
        }}
        onDismissSuggestion={(id) => {
          if (!suggestion || suggestion.id === id) setSuggestion(null);
        }}
        askValue={chatInput}
        onAskChange={(v) => {
          if (isPro) setChatInput(v);
        }}
        onAskSubmit={() => {
          if (!isPro || !chatInput.trim() || !draft.trim() || pending) return;
          const asked = chatInput.trim();
          refine(asked, "Custom request");
          setChatInput("");
        }}
        askPlaceholder={
          isPro
            ? "Ask AI to rewrite a section, tighten wording, add a role…"
            : "Free-text AI chat is a Pro feature — try a quick action above"
        }
        docPlaceholder="Paste or write your professional profile — skills, experience, achievements. Leave out your name; we redact anyway."
        saved={saved}
        busy={pending}
        docTestId="profile-draft"
        askTestId="resume-ask"
        sendTestId="resume-ask-send"
      />

      {!isPro && (
        <p className="text-xs text-muted-foreground">
          Quick actions above are free — free-text AI chat is a Pro feature.
        </p>
      )}

      {props.redactedText && (
        <div className="rounded-xl border border-border bg-muted/40 p-6">
          <p className="mb-1 text-sm font-medium">What recruiters see</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Your live redacted profile, including derived signals (never raw work-history
            entries). Pseudonymized — but treat redaction as risk reduction, not a guarantee.
          </p>
          <p className="whitespace-pre-wrap text-sm" data-testid="redacted-preview">
            {props.redactedText}
          </p>
        </div>
      )}

      <div>
        <Button variant="ghost" size="sm" render={<Link href="/seeker/profile" />}>
          ← Back to profile
        </Button>
      </div>

      <ResumeExportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        seekerTier={props.seekerTier}
        displayName={props.displayName}
        headline={props.headline}
        skills={props.skills}
        desiredRoles={props.desiredRoles}
        industries={props.industries}
        experience={props.experience}
      />

      {/* Plain list-and-pick from Google Drive — explicitly NOT the Picker
          API (DESIGN.md §14a MVP cut, src/lib/google-drive.ts). Picking a
          file replaces the draft the same way "Upload resume PDF" does. */}
      <Dialog open={driveDialogOpen} onOpenChange={setDriveDialogOpen}>
        <DialogContent data-testid="drive-file-picker">
          <DialogHeader>
            <DialogTitle>Import from Google Drive</DialogTitle>
          </DialogHeader>
          {driveLoading && <p className="text-sm text-muted-foreground">Loading recent files…</p>}
          {driveError && (
            <p className="text-sm text-destructive" data-testid="drive-error">
              {driveError}
            </p>
          )}
          {!driveLoading && !driveError && driveFiles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No PDF or Google Docs files found in your Drive.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {driveFiles.map((file) => (
              <li
                key={file.id}
                data-testid="drive-file-row"
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="truncate text-sm">{file.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={importingFileId !== null}
                  onClick={() => void importDriveFile(file)}
                >
                  {importingFileId === file.id ? "Importing…" : "Import"}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
