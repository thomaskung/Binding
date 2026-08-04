import { describe, expect, it, vi } from "vitest";

describe("pii-audit (cross-party access logging)", () => {
  it("logPiiAccess inserts an audit row with the correct shape", async () => {
    const { logPiiAccess } = await import("@/lib/pii-audit");
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const mockAdmin = { from: vi.fn().mockReturnValue({ insert: insertFn }) };
    await logPiiAccess(mockAdmin as any, {
      accessorId: "recruiter-1",
      accessorRole: "recruiter",
      subjectId: "seeker-1",
      resource: "candidate_identity",
      action: "reveal",
      reason: "standard reveal via job match",
    });
    const call = insertFn.mock.calls[0]?.[0];
    expect(call.accessor_id).toBe("recruiter-1");
    expect(call.subject_id).toBe("seeker-1");
    expect(call.resource).toBe("candidate_identity");
    expect(call.action).toBe("reveal");
    expect(call.reason).toBe("standard reveal via job match");
    expect(call.accessor_role).toBe("recruiter");
  });
});
