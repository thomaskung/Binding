/** Shared types/constants for client-held key custody (DESIGN.md §2g Phase
 * 10) — split out of key-custody-actions.ts because a `"use server"` module
 * may only export async functions; a plain constant or interface export
 * there silently invalidates the WHOLE module's exports under Next's
 * production build (caught only by a real `next build`/Vercel deploy, not
 * `tsc`/Vitest — both stayed green while this broke the actual build). */

export const RECOVERY_CODE_COUNT = 8; // same shape as a typical TOTP backup-code set

export interface WrappedDataKeyRecord {
  wrappedDek: string;
  credentialId: string;
}

export interface RecoveryCodeInput {
  codeHash: string;
  wrappedDek: string;
  salt: string;
}

export interface RedeemedRecoveryCode {
  wrappedDek: string;
  salt: string;
}
