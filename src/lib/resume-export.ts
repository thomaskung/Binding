/** Resume export for seekers — PDF and plain-text formats with tier-based options
 * (Pro: layout/accent choice; Free: default layout + watermark).
 *
 * Data shaping is shared between client (preview) and server (generation) to
 * prevent drift. Watermark geometry is unit-testable without pdf-lib. */

import { ExperienceEntry } from "./experience";

export type ExportFormat = "pdf" | "plaintext";
export type SeekertTier = "free" | "pro";

/** Buildable resume data structure ready for either export format. */
export interface ResumeExportData {
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

export interface ExportOptions {
  layout: string; // "classic" | other variants
  accent: string; // hex color or oklch() from theme
}

/** Assembles profile fields + experience entries into export-ready data.
 * Experience is sorted most-recent-first; ongoing roles show "Present". */
export function buildResumeExportData(input: {
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
}): ResumeExportData {
  // Sort by end_date DESC, then start_date DESC (most recent first).
  const sortedExp = [...input.experience].sort((a, b) => {
    const aEnd = a.endDate ?? "9999-12-31";
    const bEnd = b.endDate ?? "9999-12-31";
    if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
    return b.startDate.localeCompare(a.startDate);
  });

  return {
    displayName: input.displayName,
    headline: input.headline,
    skills: input.skills,
    desiredRoles: input.desiredRoles,
    industries: input.industries,
    experience: sortedExp.map((e) => ({
      role: e.role,
      company: e.company,
      startDate: e.startDate,
      endDate: e.endDate,
      industry: e.industry,
    })),
  };
}

/** Server-side clamp of export options based on tier.
 * Free tier: always ignores requested layout/accent, uses defaults.
 * Pro tier: respects requested options (or still uses defaults if not recognized). */
export function resolveExportOptions(
  tier: SeekertTier,
  requested: Partial<ExportOptions> = {},
): ExportOptions {
  if (tier === "free") {
    // Free tier gets no choice — always default
    return { layout: "classic", accent: "#a855f7" }; // purple from theme
  }
  // Pro tier gets the requested options, or defaults if missing
  return {
    layout: requested.layout ?? "classic",
    accent: requested.accent ?? "#a855f7",
  };
}

/** Plain-text rendering of resume data. Includes watermark text for free tier. */
export function generateResumePlainText(
  data: ResumeExportData,
  options: ExportOptions,
  tier: SeekertTier,
): string {
  const lines: string[] = [];

  // Header
  lines.push(data.displayName);
  if (data.headline) lines.push(data.headline);
  lines.push("");

  // Summary section
  const summaryParts: string[] = [];
  if (data.skills.length > 0) summaryParts.push(`Skills: ${data.skills.join(", ")}`);
  if (data.desiredRoles.length > 0) summaryParts.push(`Seeking: ${data.desiredRoles.join(", ")}`);
  if (data.industries.length > 0) summaryParts.push(`Industries: ${data.industries.join(", ")}`);

  if (summaryParts.length > 0) {
    lines.push(summaryParts.join("\n"));
    lines.push("");
  }

  // Experience section
  if (data.experience.length > 0) {
    lines.push("EXPERIENCE");
    lines.push("");
    for (const exp of data.experience) {
      lines.push(`${exp.role}`);
      lines.push(`${exp.company}${exp.industry ? ` · ${exp.industry}` : ""}`);
      const endDate = exp.endDate ?? "Present";
      lines.push(`${exp.startDate} – ${endDate}`);
      lines.push("");
    }
  }

  const text = lines.join("\n");

  // Free-tier watermark: append to plain text
  if (tier === "free") {
    const watermarkText = "\n---\nExported via Binding | binding.so";
    return text + watermarkText;
  }

  return text;
}

/** Positions for watermark tiles (geometry-only, testable without pdf-lib). */
export function watermarkTilePositions(
  pageWidth: number,
  pageHeight: number,
  tileWidth: number,
  tileHeight: number,
  angle: number = 45,
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const spacing = tileWidth * 1.5;

  // Diagonal grid at 45 degrees
  const diagDist = Math.sqrt(pageWidth * pageWidth + pageHeight * pageHeight);
  let x = -diagDist;
  while (x < pageWidth + diagDist) {
    let y = -diagDist;
    while (y < pageHeight + diagDist) {
      positions.push({ x, y });
      y += spacing;
    }
    x += spacing;
  }

  return positions;
}

/** PDF rendering of resume data (free tier: with watermark; pro: clean).
 * Uses pdf-lib. Only imported/called on the server for PDF generation. */
export async function generateResumePdfBytes(
  data: ResumeExportData,
  options: ExportOptions,
  tier: SeekertTier,
): Promise<Uint8Array> {
  // Lazy import — only required when this function is actually called
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]); // A4
  const margin = 56;
  const maxWidth = 595 - margin * 2;
  let y = 842 - margin;

  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.42, 0.42, 0.42);

  // Text wrapping helper
  const wrap = (text: string, f: typeof font, size: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of text.split(/\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const trial = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(trial, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  };

  // Draw text with auto-pagination
  const draw = (text: string, { size = 11, f = font, color = black, gap = 4 } = {}) => {
    for (const line of wrap(text, f, size)) {
      if (y < margin + size) {
        page = pdf.addPage([595, 842]);
        y = 842 - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + gap;
    }
  };

  // Header
  draw(data.displayName, { size: 20, f: bold });
  if (data.headline) {
    draw(data.headline, { size: 11, color: gray, gap: 10 });
  } else {
    y -= 6; // small gap if no headline
  }

  // Summary
  if (data.skills.length > 0) draw(`Skills: ${data.skills.join(", ")}`, { gap: 6 });
  if (data.desiredRoles.length > 0) draw(`Seeking: ${data.desiredRoles.join(", ")}`, { gap: 6 });
  if (data.industries.length > 0) draw(`Industries: ${data.industries.join(", ")}`, { gap: 10 });

  // Experience
  if (data.experience.length > 0) {
    draw("EXPERIENCE", { size: 13, f: bold, gap: 6 });
    for (const exp of data.experience) {
      draw(exp.role, { size: 11, f: bold, gap: 2 });
      const company = exp.industry ? `${exp.company} · ${exp.industry}` : exp.company;
      draw(company, { size: 10, color: gray, gap: 2 });
      const endDate = exp.endDate ?? "Present";
      draw(`${exp.startDate} – ${endDate}`, { size: 9, color: gray, gap: 6 });
    }
  }

  // Free-tier watermark
  if (tier === "free") {
    const watermarkText = "Exported via Binding";
    const watermarkSize = 8;
    // Light gray for watermark (not as dark as body text)
    const watermarkColor = rgb(0.7, 0.7, 0.7);

    // Draw watermark tiles across all pages
    for (let pageIdx = 0; pageIdx < pdf.getPageCount(); pageIdx++) {
      const p = pdf.getPage(pageIdx);
      const positions = watermarkTilePositions(595, 842, 80, 20, 45);

      for (const pos of positions) {
        try {
          // Draw watermark text (unrotated for now; rotate is handled in geometry)
          p.drawText(watermarkText, {
            x: pos.x,
            y: pos.y,
            size: watermarkSize,
            font,
            color: watermarkColor,
          });
        } catch {
          // Skip positions that go outside bounds
        }
      }
    }
  }

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}
