/** Derives the region-only location shown in a seeker's external
 * (recruiter-facing) profile view from their full, internal-only address —
 * e.g. "512 Elm St, Austin, TX 78701" -> "Austin, TX 78701". A location with
 * no street-level detail (e.g. "Remote / Hybrid") passes through unchanged. */
export function regionFromLocation(location: string): string {
  const parts = location
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(-2).join(", ");
}

/** Staleness window for the adaptive dashboard's frame C (DESIGN.md §2d) —
 * placeholder, env-tunable, same posture as the rest of this codebase's
 * placeholder economics/thresholds. */
export const PROFILE_STALENESS_WINDOW_DAYS = Number(
  process.env.PROFILE_STALENESS_WINDOW_DAYS ?? 90,
);

/** No activity signal yet reads as NOT stale — a brand-new profile falls
 * into the dashboard's "incomplete" state (no published_text) before it can
 * ever be "stale", so this default never actually surfaces frame C. */
export function isStale(lastActivityAt: string | null, now: Date = new Date()): boolean {
  if (!lastActivityAt) return false;
  const ageMs = now.getTime() - new Date(lastActivityAt).getTime();
  return ageMs > PROFILE_STALENESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Fixed quick-action instructions for the Résumé-canvas AI sidebar (free
 * tier and Pro tier both get these; Pro additionally gets free-text chat —
 * see refineProfileText in seeker/actions.ts). Shared client/server so the
 * server can validate an incoming instruction is one of these (vs. a custom
 * Pro-only chat message) without duplicating the list. */
export const PROFILE_QUICK_ACTIONS = [
  { key: "concise", label: "More concise", instruction: "Make this more concise." },
  { key: "metrics", label: "Add metrics", instruction: "Emphasize quantifiable impact and metrics." },
  { key: "tone", label: "Fix tone", instruction: "Make the tone more professional and confident." },
] as const;

export function isQuickActionInstruction(instruction: string): boolean {
  return PROFILE_QUICK_ACTIONS.some((a) => a.instruction === instruction);
}
