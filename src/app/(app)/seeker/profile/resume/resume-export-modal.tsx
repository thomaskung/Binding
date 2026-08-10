"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@binding/ui";
import {
  buildResumeExportData,
  generateResumePlainText,
  resolveExportOptions,
  type ExportFormat,
  type ExportOptions,
  type ResumeExportData,
} from "@/lib/resume-export";

interface ResumeExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

const LAYOUT_OPTIONS = [
  { id: "classic", label: "Classic" },
] as const;

const ACCENT_OPTIONS = [
  { id: "purple", label: "Purple", color: "#a855f7" },
  { id: "blue", label: "Blue", color: "#3b82f6" },
  { id: "slate", label: "Slate", color: "#64748b" },
  { id: "emerald", label: "Emerald", color: "#10b981" },
] as const;

export function ResumeExportModal({
  open,
  onOpenChange,
  seekerTier,
  displayName,
  headline,
  skills,
  desiredRoles,
  industries,
  experience,
}: ResumeExportModalProps) {
  const [selectedLayout, setSelectedLayout] = useState("classic");
  const [selectedAccent, setSelectedAccent] = useState("purple");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("plaintext");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPro = seekerTier === "pro";

  // Build preview data once
  const exportData: ResumeExportData = buildResumeExportData({
    displayName,
    headline,
    skills,
    desiredRoles,
    industries,
    experience,
  });

  // Generate plain-text preview (always show it)
  const tier = isPro ? "pro" : "free";
  const options = resolveExportOptions(
    tier,
    isPro ? { layout: selectedLayout, accent: selectedAccent } : undefined,
  );
  const previewText = generateResumePlainText(exportData, options, tier);

  const handleExport = (format: ExportFormat) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/resume-export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            format,
            layout: isPro ? selectedLayout : undefined,
            accent: isPro ? selectedAccent : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `export failed (${res.status})`);
        }

        // Trigger download
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download =
          format === "pdf"
            ? `${displayName}-resume.pdf`
            : `${displayName}-resume.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "export failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Resume</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-4">
          {/* Format selection */}
          <div>
            <p className="mb-2 text-sm font-medium">Format</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFormat("plaintext")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                  selectedFormat === "plaintext"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                Plain Text
              </button>
              {isPro && (
                <button
                  onClick={() => setSelectedFormat("pdf")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    selectedFormat === "pdf"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  PDF
                </button>
              )}
            </div>
          </div>

          {/* Pro-only layout/accent options */}
          {isPro && selectedFormat === "pdf" && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium">Layout</p>
                <div className="flex gap-2">
                  {LAYOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedLayout(opt.id)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                        selectedLayout === opt.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Accent Color</p>
                <div className="flex gap-2">
                  {ACCENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedAccent(opt.id)}
                      className={`h-10 w-10 rounded-lg border-2 transition ${
                        selectedAccent === opt.id ? "border-primary" : "border-border"
                      }`}
                      style={{ backgroundColor: opt.color }}
                      title={opt.label}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Preview */}
          <div>
            <p className="mb-2 text-sm font-medium">Preview</p>
            <div className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              <pre className="whitespace-pre-wrap break-words font-sans">{previewText}</pre>
            </div>
          </div>

          {/* Free tier upsell */}
          {!isPro && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge>Pro Feature</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                PDF export with custom layouts and colors is a Pro feature. Upgrade to unlock it.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          {selectedFormat === "plaintext" ? (
            <Button
              onClick={() => handleExport("plaintext")}
              disabled={pending}
              data-testid="export-plaintext"
            >
              {pending ? "Exporting…" : "Export as Text"}
            </Button>
          ) : (
            <Button
              onClick={() => handleExport("pdf")}
              disabled={pending}
              data-testid="export-pdf"
            >
              {pending ? "Exporting…" : "Export as PDF"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
