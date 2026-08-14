/**
 * Client-held key custody primitives (DESIGN.md §2g, Phase 10). Pure Web
 * Crypto (`globalThis.crypto.subtle`/`getRandomValues`) — no `node:crypto`
 * import — so this module runs identically in the browser (where it does
 * real work, deriving keys from a WebAuthn `prf` ceremony or a recovery
 * code) and in Node/Vitest (where it's unit-tested directly, no polyfill).
 *
 * Everything here is envelope encryption: a per-user AES-256-GCM "data key"
 * (DEK) encrypts the actual resume artifacts; the DEK itself is never
 * stored raw — only "wrapped" (AES-GCM-encrypted) under a "key-encryption
 * key" (KEK) derived either from a passkey's `prf` output or a recovery
 * code. The server only ever holds wrapped bytes it cannot itself unwrap.
 */

const AES_KEY_LENGTH = 256;
const GCM_IV_BYTES = 12;
export const RECOVERY_PBKDF2_ITERATIONS = 210_000; // OWASP 2026 PBKDF2-SHA256 floor; placeholder, tune later

function subtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Fresh 32-byte AES-256 data key, as raw exportable bytes (not yet a
 * CryptoKey — callers pass it to `importAesKey` for actual use, or wrap it
 * directly for storage). */
export function generateDataKey(): Uint8Array {
  return randomBytes(32);
}

export async function importAesKey(raw: Uint8Array, usages: KeyUsage[] = ["encrypt", "decrypt"]): Promise<CryptoKey> {
  return subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM", length: AES_KEY_LENGTH }, false, usages);
}

/** AES-GCM encrypt with a fresh random 12-byte IV, prepended to the
 * ciphertext (`nonce || ciphertext`) so no separate nonce column/field is
 * needed to decrypt later — the blob is self-describing. */
export async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(GCM_IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

/** Reverses `aesGcmEncrypt`. Throws (AES-GCM auth-tag mismatch) if `key` is
 * wrong — there is no silent wrong-key failure mode by construction. */
export async function aesGcmDecrypt(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array> {
  const iv = blob.slice(0, GCM_IV_BYTES);
  const ciphertext = blob.slice(GCM_IV_BYTES);
  const plaintext = await subtle().decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
  return new Uint8Array(plaintext);
}

/** Wrap a raw DEK under a KEK — base64(nonce || ciphertext), ready to store. */
export async function wrapDek(kek: CryptoKey, dek: Uint8Array): Promise<string> {
  return toBase64(await aesGcmEncrypt(kek, dek));
}

/** Unwrap a stored DEK under a KEK. Throws on the wrong KEK. */
export async function unwrapDek(kek: CryptoKey, wrapped: string): Promise<Uint8Array> {
  return aesGcmDecrypt(kek, fromBase64(wrapped));
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function encryptText(dek: CryptoKey, text: string): Promise<string> {
  return toBase64(await aesGcmEncrypt(dek, textEncoder.encode(text)));
}

export async function decryptText(dek: CryptoKey, blobB64: string): Promise<string> {
  return textDecoder.decode(await aesGcmDecrypt(dek, fromBase64(blobB64)));
}

export async function encryptBytes(dek: CryptoKey, bytes: Uint8Array): Promise<string> {
  return toBase64(await aesGcmEncrypt(dek, bytes));
}

export async function decryptBytes(dek: CryptoKey, blobB64: string): Promise<Uint8Array> {
  return aesGcmDecrypt(dek, fromBase64(blobB64));
}

/** KEK derivation from a WebAuthn `prf` extension result. The prf output is
 * already a high-entropy, credential-bound secret; hashing it through
 * SHA-256 with a fixed app-specific label first is cheap domain separation
 * (so this KEK can never collide with a KEK derived the same way for an
 * unrelated purpose from the same raw prf bytes), not a security load-bearer
 * on its own. */
export async function deriveKekFromPrf(prfOutput: Uint8Array): Promise<CryptoKey> {
  const label = textEncoder.encode("binding:resume-dek-kek:v1");
  const material = new Uint8Array(label.length + prfOutput.length);
  material.set(label, 0);
  material.set(prfOutput, label.length);
  const digest = new Uint8Array(await subtle().digest("SHA-256", material as BufferSource));
  return importAesKey(digest, ["encrypt", "decrypt"]);
}

/** KEK derivation from a recovery code — PBKDF2-SHA256 over the code's raw
 * UTF-8 bytes with a per-code random salt (stored alongside the wrapped DEK
 * in `user_data_key_recovery`, per-code so codes can't be correlated). */
export async function deriveKekFromRecoveryCode(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await subtle().importKey("raw", textEncoder.encode(code) as BufferSource, "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: RECOVERY_PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/** A human-typeable one-time recovery code: 10 random bytes, hex-encoded and
 * grouped for readability (`xxxx-xxxx-xxxx-xxxx-xxxx`). Not trying to be
 * memorable — it's written down/downloaded once, same UX as a TOTP backup
 * code. */
export function generateRecoveryCode(): string {
  const hex = Array.from(randomBytes(10), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex.match(/.{1,4}/g)!.join("-");
}

/** sha256 hex digest of a recovery code — what actually gets stored
 * (`user_data_key_recovery.code_hash`). The code itself is never persisted;
 * redemption re-hashes the candidate input and compares. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", textEncoder.encode(code) as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
