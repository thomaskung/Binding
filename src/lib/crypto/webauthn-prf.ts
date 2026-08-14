/**
 * Browser-only WebAuthn `prf`-extension ceremony (DESIGN.md §2g, Phase 10).
 * NOT the same feature as Supabase's own (unused, commented-out) passkey
 * login config — this credential is never a sign-in factor, it exists
 * purely to derive a key-encryption-key client-side. Not unit-tested (no
 * `navigator.credentials` in Node/Vitest) — exercised via manual QA and,
 * where the environment supports it, `e2e/resume-encryption.spec.ts`.
 *
 * The `eval.first` salt below is a fixed, PUBLIC, app-specific constant, not
 * a secret — per the WebAuthn `prf` extension, secrecy comes from the
 * credential-bound PRF key inside the authenticator, not from this input.
 * Its only job is domain separation (so this app's derived secret differs
 * from any other RP's derived secret for the same authenticator).
 */

const PRF_SALT_LABEL = "binding.app:resume-key-custody:v1";

/** `eval.first` must be exactly 32 bytes — pad/truncate the label
 * deterministically so this never depends on the label string's byte
 * length matching 32 by coincidence. */
function prfSalt(): Uint8Array {
  const salt = new Uint8Array(32);
  salt.set(new TextEncoder().encode(PRF_SALT_LABEL).slice(0, 32));
  return salt;
}

export interface PrfEnrollment {
  credentialId: string; // base64
  prfOutput: Uint8Array;
}

/** True only if the platform exposes the WebAuthn API at all — this is a
 * necessary, not sufficient, precondition: whether the authenticator itself
 * supports `prf` is only known after attempting `create()`. */
export function hasWebAuthnSupport(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Registers a new passkey with the `prf` extension requested, then
 * immediately runs a `get()` to pull the actual PRF output (some
 * authenticators only populate `prf.results` on `get()`, not `create()`).
 * Returns null (never throws) if the authenticator doesn't support `prf` —
 * callers show "not supported on this device/browser" and leave encryption
 * off; this is an opt-in feature, not a hard requirement. */
export async function enrollPasskey(displayName: string): Promise<PrfEnrollment | null> {
  if (!hasWebAuthnSupport()) return null;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Binding" },
      user: { id: userId, name: displayName, displayName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) return null;

  const createResults = credential.getClientExtensionResults() as { prf?: { enabled?: boolean } };
  if (!createResults.prf?.enabled) return null;

  const credentialId = toBase64(credential.rawId);
  const prfOutput = await evalPrf(credentialId);
  return prfOutput ? { credentialId, prfOutput } : null;
}

/** Re-derive the same PRF output for an already-enrolled credential — the
 * "session-scoped unlock" ceremony: called once per browser session before
 * the first encrypted upload/decrypt, then the derived KEK is cached
 * in-memory only (see src/lib/crypto/session-key.ts) for the rest of the
 * tab's lifetime. Never persisted (localStorage/sessionStorage would defeat
 * the point). */
export async function evalPrf(credentialId: string): Promise<Uint8Array | null> {
  if (!hasWebAuthnSupport()) return null;
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: fromBase64(credentialId) as BufferSource, type: "public-key" }],
      userVerification: "preferred",
      extensions: { prf: { eval: { first: prfSalt() as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) return null;

  const results = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const first = results.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}
