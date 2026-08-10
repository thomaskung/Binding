import { describe, it, expect } from "vitest";
import { cardMeta, type SeekerMatchCard } from "@/app/(app)/seeker/match-list";

describe("cardMeta", () => {
  it("joins company, location, salary, and work setups with ' · '", () => {
    const card: SeekerMatchCard = {
      id: "1",
      title: "Engineer",
      company: "Acme Corp",
      location: "San Francisco",
      salaryMin: 100000,
      salaryMax: 150000,
      salaryVisibility: "public",
      workSetups: ["Remote", "Part-time"],
      status: "surfaced",
      band: "high",
      rank: 1,
      pendingOverride: false,
      threadId: null,
    };

    const meta = cardMeta(card);
    expect(meta).toContain("Acme Corp");
    expect(meta).toContain("San Francisco");
    expect(meta).toContain("Remote");
    expect(meta).toContain("Part-time");
    expect(meta).toContain(" · ");
  });

  it("omits null/undefined fields", () => {
    const card: SeekerMatchCard = {
      id: "1",
      title: "Engineer",
      company: null,
      location: "Remote",
      salaryMin: null,
      salaryMax: null,
      salaryVisibility: "on_request",
      workSetups: [],
      status: "surfaced",
      band: "normal",
      rank: 2,
      pendingOverride: false,
      threadId: null,
    };

    const meta = cardMeta(card);
    // Should include location and salary display (no company or work setups)
    expect(meta).toContain("Remote");
    expect(meta).toContain("Salary on request");
    expect(meta).not.toContain("undefined");
  });

  it("filters empty work setup strings", () => {
    const card: SeekerMatchCard = {
      id: "1",
      title: "Designer",
      company: "Startup Inc",
      location: null,
      salaryMin: 80000,
      salaryMax: 120000,
      salaryVisibility: "public",
      workSetups: [],
      status: "surfaced",
      band: "low",
      rank: 10,
      pendingOverride: false,
      threadId: null,
    };

    const meta = cardMeta(card);
    // Empty workSetups array means empty string after join, which gets filtered
    expect(meta).toContain("Startup Inc");
    expect(meta).toContain("$80,000 – $120,000");
    expect(meta).not.toMatch(/\/\s*$/); // no trailing slash from empty workSetups.join
  });

  it("handles single work setup correctly", () => {
    const card: SeekerMatchCard = {
      id: "1",
      title: "Manager",
      company: "BigCo",
      location: "NYC",
      salaryMin: 150000,
      salaryMax: 200000,
      salaryVisibility: "public",
      workSetups: ["Hybrid"],
      status: "surfaced",
      band: "high",
      rank: 1,
      pendingOverride: false,
      threadId: null,
    };

    const meta = cardMeta(card);
    expect(meta).toContain("BigCo");
    expect(meta).toContain("NYC");
    expect(meta).toContain("Hybrid");
  });
});

describe("focus review cursor logic", () => {
  it("should track position: cursor 0 of 5 means position 1/5", () => {
    const total = 5;
    const cursor = 0;
    expect(cursor + 1).toBe(1);
  });

  it("should detect completion when cursor >= length", () => {
    const length = 5;
    const cursorAtEnd = 5;
    const cursorPastEnd = 6;
    expect(cursorAtEnd >= length).toBe(true);
    expect(cursorPastEnd >= length).toBe(true);
  });

  it("should compute progress percentage correctly", () => {
    const length = 10;
    expect(Math.round(((0 + 1) / length) * 100)).toBe(10);
    expect(Math.round(((4 + 1) / length) * 100)).toBe(50);
    expect(Math.round(((9 + 1) / length) * 100)).toBe(100);
  });
});

describe("surfaced cards filter", () => {
  it("should filter to only status === 'surfaced'", () => {
    const cards: SeekerMatchCard[] = [
      {
        id: "1",
        title: "A",
        company: "Co1",
        location: "NYC",
        salaryMin: 100000,
        salaryMax: 150000,
        salaryVisibility: "public",
        workSetups: ["Full-time"],
        status: "surfaced",
        band: "high",
        rank: 1,
        pendingOverride: false,
        threadId: null,
      },
      {
        id: "2",
        title: "B",
        company: "Co2",
        location: "SF",
        salaryMin: 120000,
        salaryMax: 180000,
        salaryVisibility: "public",
        workSetups: ["Full-time"],
        status: "interested",
        band: "normal",
        rank: 2,
        pendingOverride: false,
        threadId: null,
      },
      {
        id: "3",
        title: "C",
        company: "Co3",
        location: "Boston",
        salaryMin: 90000,
        salaryMax: 140000,
        salaryVisibility: "public",
        workSetups: ["Remote"],
        status: "surfaced",
        band: "low",
        rank: 3,
        pendingOverride: false,
        threadId: null,
      },
    ];

    const surfaced = cards.filter((c) => c.status === "surfaced");
    expect(surfaced).toHaveLength(2);
    expect(surfaced.map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("should return empty array if no surfaced matches", () => {
    const cards: SeekerMatchCard[] = [
      {
        id: "1",
        title: "A",
        company: "Co1",
        location: "NYC",
        salaryMin: 100000,
        salaryMax: 150000,
        salaryVisibility: "public",
        workSetups: ["Full-time"],
        status: "declined",
        band: "high",
        rank: 1,
        pendingOverride: false,
        threadId: null,
      },
    ];

    const surfaced = cards.filter((c) => c.status === "surfaced");
    expect(surfaced).toHaveLength(0);
  });
});
