/** Self-service data export (DSAR — "Data Subject Access Request") rate
 * limiting, DESIGN.md §14j: "rate-limited (once/30 days, matching
 * REVEAL_DAILY_CAP/freshness-confirmation's existing rate-limit
 * discipline)". Mirrors src/lib/points.ts's revealSpendGuard shape: a pure
 * guard function that returns an error message or null, checked BEFORE the
 * export runs — same "cap checked first" discipline, just a cooldown-window
 * cap instead of a per-day count, since DSAR exports are rate-limited by
 * elapsed time since the last one rather than a same-day count. */

export const DSAR_EXPORT_COOLDOWN_DAYS = Number(process.env.DSAR_EXPORT_COOLDOWN_DAYS ?? 30);

export interface DsarExportGuardInput {
  /** `profiles.dsar_last_exported_at` — null means never exported, always allowed. */
  lastExportedAt: Date | null;
  now: Date;
  cooldownDays: number;
}

/** Returns an error message if the export must be blocked, or null if it may
 * proceed. At-or-past the exact cooldown boundary is allowed (elapsed time
 * strictly less than the cooldown is what blocks) — mirrors
 * revealSpendGuard's ">= cap blocks" convention applied to a time window. */
export function dsarExportGuard(input: DsarExportGuardInput): string | null {
  if (!input.lastExportedAt) return null;

  const cooldownMs = input.cooldownDays * 24 * 60 * 60 * 1000;
  const elapsedMs = input.now.getTime() - input.lastExportedAt.getTime();
  if (elapsedMs < cooldownMs) {
    const nextAvailable = new Date(input.lastExportedAt.getTime() + cooldownMs);
    return `data export is limited to once every ${input.cooldownDays} days — next available ${nextAvailable.toISOString().slice(0, 10)}`;
  }
  return null;
}

/** Convenience for the settings page: when the next export becomes
 * available, or null if one may happen right now. Pure, same inputs as the
 * guard above. */
export function dsarNextAvailableAt(input: DsarExportGuardInput): Date | null {
  if (!input.lastExportedAt) return null;
  const cooldownMs = input.cooldownDays * 24 * 60 * 60 * 1000;
  const nextAvailable = new Date(input.lastExportedAt.getTime() + cooldownMs);
  return nextAvailable.getTime() <= input.now.getTime() ? null : nextAvailable;
}
