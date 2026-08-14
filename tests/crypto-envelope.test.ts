import { describe, expect, it } from "vitest";
import {
  decryptBytes,
  decryptText,
  deriveKekFromPrf,
  deriveKekFromRecoveryCode,
  encryptBytes,
  encryptText,
  generateDataKey,
  generateRecoveryCode,
  hashRecoveryCode,
  importAesKey,
  randomBytes,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto/envelope";

describe("envelope crypto (DESIGN.md §2g Phase 10)", () => {
  it("wraps and unwraps a DEK under a KEK — round trip", async () => {
    const kek = await deriveKekFromPrf(randomBytes(32));
    const dek = generateDataKey();
    const wrapped = await wrapDek(kek, dek);
    const unwrapped = await unwrapDek(kek, wrapped);
    expect(Array.from(unwrapped)).toEqual(Array.from(dek));
  });

  it("fails loudly (throws) when unwrapping with the wrong KEK", async () => {
    const kek = await deriveKekFromPrf(randomBytes(32));
    const wrongKek = await deriveKekFromPrf(randomBytes(32));
    const dek = generateDataKey();
    const wrapped = await wrapDek(kek, dek);
    await expect(unwrapDek(wrongKek, wrapped)).rejects.toThrow();
  });

  it("encrypts and decrypts text through a DEK — round trip", async () => {
    const dek = await importAesKey(generateDataKey());
    const plaintext = "the quick brown fox, full résumé text with unicode é";
    const blob = await encryptText(dek, plaintext);
    expect(blob).not.toContain(plaintext);
    expect(await decryptText(dek, blob)).toBe(plaintext);
  });

  it("encrypts and decrypts binary (PDF-shaped) bytes through a DEK — round trip", async () => {
    const dek = await importAesKey(generateDataKey());
    const bytes = randomBytes(2048);
    const blob = await encryptBytes(dek, bytes);
    const decrypted = await decryptBytes(dek, blob);
    expect(Array.from(decrypted)).toEqual(Array.from(bytes));
  });

  it("derives the same recovery KEK from the same code + salt, a different one for a different code", async () => {
    const salt = randomBytes(16);
    const kekA = await deriveKekFromRecoveryCode("abcd-1234-efgh-5678", salt);
    const kekB = await deriveKekFromRecoveryCode("abcd-1234-efgh-5678", salt);
    const kekC = await deriveKekFromRecoveryCode("different-code-0000", salt);

    const dek = generateDataKey();
    const wrapped = await wrapDek(kekA, dek);
    // Same code+salt unwraps fine...
    expect(Array.from(await unwrapDek(kekB, wrapped))).toEqual(Array.from(dek));
    // ...a different code does not.
    await expect(unwrapDek(kekC, wrapped)).rejects.toThrow();
  });

  it("generates recovery codes in the expected human-typeable shape, no two alike", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(20);
    for (const code of codes) expect(code).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){4}$/);
  });

  it("hashes a recovery code deterministically, never reversibly to the code itself", async () => {
    const code = "test-code-1234";
    const hashA = await hashRecoveryCode(code);
    const hashB = await hashRecoveryCode(code);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toContain(code);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });
});
