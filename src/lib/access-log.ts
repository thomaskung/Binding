/** "Who accessed my data" ledger formatting (DESIGN.md §14j). The actual
 * tier/opt-out gating (whether a recruiter's identity is disclosed at all)
 * happens SERVER-SIDE inside the `get_my_access_log()` SQL function
 * (migration 0028) — that function already returns `accessor_id`/
 * `recruiter_display_name` as null when the name shouldn't be shown, so a
 * free-tier seeker's client never receives the real identity in the first
 * place. This module only turns already-gated rows into display strings; it
 * makes no trust decisions of its own. */

export interface AccessLogRow {
  id: string;
  createdAt: string;
  resource: string;
  action: string;
  companyName: string | null;
  /** Null when get_my_access_log() decided this shouldn't be shown (free
   * tier, or the recruiter has hide_name_on_reveal set) — never a client-side
   * decision. */
  recruiterDisplayName: string | null;
}

export interface FormattedAccessLogRow {
  id: string;
  createdAt: string;
  companyName: string;
  /** Human-readable label for who accessed the data — either the honestly
   * caveated on-file name, or the anonymized fallback. */
  recruiterLabel: string;
  actionLabel: string;
}

const ACTION_LABELS: Record<string, string> = {
  standard_reveal: "revealed your identity (you had opted in)",
  override_reveal: "revealed your identity (paid override, pre-opt-in)",
};

/** Pure formatter: turns one already-gated access-log row into display
 * strings. Never itself decides whether a name should show — that decision
 * already happened in SQL (see module doc comment above). */
export function formatAccessLogRow(row: AccessLogRow): FormattedAccessLogRow {
  return {
    id: row.id,
    createdAt: row.createdAt,
    companyName: row.companyName ?? "A company",
    recruiterLabel: row.recruiterDisplayName
      ? `${row.recruiterDisplayName} (recruiter-provided name, not independently verified)`
      : "A recruiter",
    actionLabel: ACTION_LABELS[row.action] ?? row.action,
  };
}
