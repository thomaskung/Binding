import { describe, expect, it } from "vitest";
import { formatAccessLogRow } from "@/lib/access-log";

describe("formatAccessLogRow", () => {
  it("shows the on-file name with the honest verification caveat when the RPC returned one", () => {
    const row = formatAccessLogRow({
      id: "1",
      createdAt: "2026-08-01T00:00:00Z",
      resource: "candidate_identity",
      action: "standard_reveal",
      companyName: "Acme Corp",
      recruiterDisplayName: "Jane Doe",
    });
    expect(row.recruiterLabel).toBe(
      "Jane Doe (recruiter-provided name, not independently verified)",
    );
    expect(row.companyName).toBe("Acme Corp");
  });

  it("falls back to an anonymized label when the RPC withheld the name (free tier or hide_name_on_reveal)", () => {
    const row = formatAccessLogRow({
      id: "2",
      createdAt: "2026-08-01T00:00:00Z",
      resource: "candidate_identity",
      action: "override_reveal",
      companyName: "Acme Corp",
      recruiterDisplayName: null,
    });
    expect(row.recruiterLabel).toBe("A recruiter");
  });

  it("falls back to a generic company label if company_name is somehow null", () => {
    const row = formatAccessLogRow({
      id: "3",
      createdAt: "2026-08-01T00:00:00Z",
      resource: "candidate_identity",
      action: "standard_reveal",
      companyName: null,
      recruiterDisplayName: null,
    });
    expect(row.companyName).toBe("A company");
  });

  it("maps known action codes to a human-readable label, and passes through unknown ones", () => {
    expect(
      formatAccessLogRow({
        id: "4",
        createdAt: "x",
        resource: "candidate_identity",
        action: "standard_reveal",
        companyName: "Acme",
        recruiterDisplayName: null,
      }).actionLabel,
    ).toMatch(/opted in/);

    expect(
      formatAccessLogRow({
        id: "5",
        createdAt: "x",
        resource: "candidate_identity",
        action: "override_reveal",
        companyName: "Acme",
        recruiterDisplayName: null,
      }).actionLabel,
    ).toMatch(/paid override/);

    expect(
      formatAccessLogRow({
        id: "6",
        createdAt: "x",
        resource: "candidate_identity",
        action: "some_future_action",
        companyName: "Acme",
        recruiterDisplayName: null,
      }).actionLabel,
    ).toBe("some_future_action");
  });
});
