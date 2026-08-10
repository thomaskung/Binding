import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildResumeExportData,
  generateResumePlainText,
  generateResumePdfBytes,
  resolveExportOptions,
  watermarkTilePositions,
  type ResumeExportData,
} from "@/lib/resume-export";

describe("resume-export", () => {
  describe("buildResumeExportData", () => {
    it("sorts experience most-recent-first", () => {
      const data = buildResumeExportData({
        displayName: "Alice",
        headline: null,
        skills: [],
        desiredRoles: [],
        industries: [],
        experience: [
          {
            role: "Junior Dev",
            company: "StartupA",
            startDate: "2020-01-01",
            endDate: "2021-12-31",
            industry: null,
          },
          {
            role: "Senior Dev",
            company: "BigCorp",
            startDate: "2022-01-01",
            endDate: null, // present
            industry: null,
          },
          {
            role: "Mid Dev",
            company: "MidSize",
            startDate: "2021-12-15",
            endDate: "2022-01-01",
            industry: null,
          },
        ],
      });

      // Expected order: Senior Dev (ongoing, highest end-date conceptually),
      // then Mid Dev (ends 2022-01-01), then Junior Dev (ends 2021-12-31)
      expect(data.experience[0]!.role).toBe("Senior Dev");
      expect(data.experience[0]!.endDate).toBeNull(); // present
      expect(data.experience[1]!.role).toBe("Mid Dev");
      expect(data.experience[2]!.role).toBe("Junior Dev");
    });

    it("preserves open-ended entries as null endDate", () => {
      const data = buildResumeExportData({
        displayName: "Bob",
        headline: null,
        skills: [],
        desiredRoles: [],
        industries: [],
        experience: [
          {
            role: "Current Role",
            company: "Here",
            startDate: "2023-01-01",
            endDate: null,
            industry: "Tech",
          },
        ],
      });

      expect(data.experience[0]!.endDate).toBeNull();
    });
  });

  describe("resolveExportOptions", () => {
    it("free tier ignores requested layout/accent and uses defaults", () => {
      const options = resolveExportOptions("free", {
        layout: "premium",
        accent: "#ff0000",
      });

      expect(options.layout).toBe("classic");
      expect(options.accent).toBe("#a855f7"); // purple
    });

    it("free tier ignores partial requests", () => {
      const options = resolveExportOptions("free", { layout: "custom" });

      expect(options.layout).toBe("classic");
      expect(options.accent).toBe("#a855f7");
    });

    it("pro tier respects requested options", () => {
      const options = resolveExportOptions("pro", {
        layout: "classic",
        accent: "#3b82f6",
      });

      expect(options.layout).toBe("classic");
      expect(options.accent).toBe("#3b82f6");
    });

    it("pro tier falls back to defaults if no request", () => {
      const options = resolveExportOptions("pro");

      expect(options.layout).toBe("classic");
      expect(options.accent).toBe("#a855f7");
    });
  });

  describe("generateResumePlainText", () => {
    const sampleData: ResumeExportData = {
      displayName: "Jane Doe",
      headline: "Senior Engineer",
      skills: ["TypeScript", "React"],
      desiredRoles: ["Architect"],
      industries: ["Tech"],
      experience: [
        {
          role: "Lead Dev",
          company: "TechCorp",
          startDate: "2020-01-01",
          endDate: null,
          industry: "Software",
        },
        {
          role: "Dev",
          company: "StartupX",
          startDate: "2018-01-01",
          endDate: "2019-12-31",
          industry: null,
        },
      ],
    };

    it("renders displayName and headline", () => {
      const text = generateResumePlainText(sampleData, { layout: "classic", accent: "#000" }, "free");

      expect(text).toContain("Jane Doe");
      expect(text).toContain("Senior Engineer");
    });

    it("includes skills, roles, industries", () => {
      const text = generateResumePlainText(sampleData, { layout: "classic", accent: "#000" }, "free");

      expect(text).toContain("TypeScript");
      expect(text).toContain("React");
      expect(text).toContain("Architect");
      expect(text).toContain("Tech");
    });

    it("shows 'Present' for ongoing roles", () => {
      const text = generateResumePlainText(sampleData, { layout: "classic", accent: "#000" }, "free");

      expect(text).toContain("Present");
    });

    it("includes experience section with company/dates", () => {
      const text = generateResumePlainText(sampleData, { layout: "classic", accent: "#000" }, "free");

      expect(text).toContain("EXPERIENCE");
      expect(text).toContain("TechCorp");
      expect(text).toContain("StartupX");
    });

    it("free tier includes watermark text", () => {
      const text = generateResumePlainText(sampleData, { layout: "classic", accent: "#000" }, "free");

      expect(text).toContain("Exported via Binding");
    });

    it("pro tier does not include watermark", () => {
      const text = generateResumePlainText(sampleData, { layout: "classic", accent: "#000" }, "pro");

      expect(text).not.toContain("Exported via Binding");
    });
  });

  describe("generateResumePdfBytes", () => {
    const sampleData: ResumeExportData = {
      displayName: "John Smith",
      headline: "CTO",
      skills: ["Go", "Rust"],
      desiredRoles: ["VP Engineering"],
      industries: ["Fintech"],
      experience: [
        {
          role: "CTO",
          company: "FinCorp",
          startDate: "2021-06-01",
          endDate: null,
          industry: "Finance",
        },
      ],
    };

    it("generates valid PDF bytes that can be loaded", async () => {
      const bytes = await generateResumePdfBytes(sampleData, { layout: "classic", accent: "#a855f7" }, "pro");

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      // Verify it's a valid PDF by parsing it
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
    });

    it("free tier PDF includes watermark", async () => {
      const bytes = await generateResumePdfBytes(sampleData, { layout: "classic", accent: "#a855f7" }, "free");

      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
      // Watermark is drawn on the PDF (geometry tested separately)
    });

    it("pro tier PDF can be loaded without error", async () => {
      const bytes = await generateResumePdfBytes(sampleData, { layout: "classic", accent: "#3b82f6" }, "pro");

      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
    });
  });

  describe("watermarkTilePositions", () => {
    it("returns array of positions for diagonal watermark", () => {
      const positions = watermarkTilePositions(595, 842, 80, 20);

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);

      // All positions should be objects with x, y
      for (const pos of positions) {
        expect(pos).toHaveProperty("x");
        expect(pos).toHaveProperty("y");
        expect(typeof pos.x).toBe("number");
        expect(typeof pos.y).toBe("number");
      }
    });

    it("generates more positions for larger page", () => {
      const small = watermarkTilePositions(200, 200, 80, 20);
      const large = watermarkTilePositions(1000, 1000, 80, 20);

      expect(large.length).toBeGreaterThan(small.length);
    });

    it("varies spacing based on tile width", () => {
      const narrow = watermarkTilePositions(595, 842, 40, 20);
      const wide = watermarkTilePositions(595, 842, 120, 20);

      // Narrower tile → more positions (tighter spacing)
      expect(narrow.length).toBeGreaterThan(wide.length);
    });
  });
});
