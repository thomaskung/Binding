/** Header AI-suggestion chip copy (app-shell nav parity pass) — pure
 * derivation so it's unit-testable without a DB round-trip; the layout
 * fetches the counts, these functions just pick the string. */

function formatChipCount(n: number): string {
  return n > 9 ? "9+" : String(n);
}

export function suggestionForSeeker(isStaleProfile: boolean, newMatchCount: number): string | null {
  if (isStaleProfile) return "Refresh your profile";
  if (newMatchCount > 0) {
    return `${formatChipCount(newMatchCount)} new match${newMatchCount === 1 ? "" : "es"}`;
  }
  return null;
}

export function suggestionForRecruiter(pendingCount: number): string | null {
  if (pendingCount > 0) {
    return `${formatChipCount(pendingCount)} candidate${pendingCount === 1 ? "" : "s"} to review`;
  }
  return null;
}
