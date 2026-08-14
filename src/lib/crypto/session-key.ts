/**
 * Session-scoped unlock (DESIGN.md §2g Phase 10's named MVP relaxation vs.
 * full per-operation re-auth): once a browser tab has run the passkey `prf`
 * ceremony once, the unwrapped DEK is cached in this module-level variable
 * for the rest of the tab's lifetime — never written to localStorage/
 * sessionStorage (that would persist it across reloads, which is exactly
 * what "session-scoped" is deliberately choosing not to do). A reload
 * re-derives it from scratch via another `prf` ceremony.
 *
 * Callers pass in the wrapped-DEK fetch as a function rather than this
 * module importing a server action directly, so `src/lib/crypto/*` stays
 * free of any `next/*`/app-layer dependency.
 */
import { deriveKekFromPrf, importAesKey, unwrapDek } from "@/lib/crypto/envelope";
import { evalPrf } from "@/lib/crypto/webauthn-prf";

let cachedDek: CryptoKey | null = null;
let cachedForCredentialId: string | null = null;

export interface WrappedDataKeyRecord {
  wrappedDek: string;
  credentialId: string;
}

/** Returns the unwrapped session DEK, running the `prf` ceremony if it
 * hasn't been unlocked yet this tab session (or if the enrolled credential
 * changed since — e.g. after re-enrollment). Returns null if the seeker
 * hasn't enrolled at all, or if the ceremony is declined/unsupported. */
export async function getSessionDataKey(
  fetchWrappedDataKey: () => Promise<WrappedDataKeyRecord | null>,
): Promise<CryptoKey | null> {
  const record = await fetchWrappedDataKey();
  if (!record) return null;

  if (cachedDek && cachedForCredentialId === record.credentialId) return cachedDek;

  const prfOutput = await evalPrf(record.credentialId);
  if (!prfOutput) return null;

  const kek = await deriveKekFromPrf(prfOutput);
  const rawDek = await unwrapDek(kek, record.wrappedDek);
  const dek = await importAesKey(rawDek);

  cachedDek = dek;
  cachedForCredentialId = record.credentialId;
  return dek;
}

/** Clears the in-memory cache — call after re-enrollment (old cached DEK
 * would silently keep encrypting under the retired credential otherwise) or
 * on sign-out. */
export function clearSessionDataKey(): void {
  cachedDek = null;
  cachedForCredentialId = null;
}
