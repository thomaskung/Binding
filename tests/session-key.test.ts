import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKekFromPrf, generateDataKey, randomBytes, wrapDek } from "@/lib/crypto/envelope";

vi.mock("@/lib/crypto/webauthn-prf", () => ({
  evalPrf: vi.fn(),
}));

import { evalPrf } from "@/lib/crypto/webauthn-prf";
import { clearSessionDataKey, getSessionDataKey } from "@/lib/crypto/session-key";

const mockEvalPrf = vi.mocked(evalPrf);

describe("session-key (DESIGN.md §2g Phase 10 session-scoped unlock)", () => {
  beforeEach(() => {
    clearSessionDataKey();
    mockEvalPrf.mockReset();
  });

  it("returns null when the profile hasn't enrolled (no wrapped-key record)", async () => {
    const dek = await getSessionDataKey(async () => null);
    expect(dek).toBeNull();
    expect(mockEvalPrf).not.toHaveBeenCalled();
  });

  it("returns null when the prf ceremony is declined/unsupported", async () => {
    mockEvalPrf.mockResolvedValue(null);
    const dek = await getSessionDataKey(async () => ({ wrappedDek: "irrelevant", credentialId: "cred-1" }));
    expect(dek).toBeNull();
  });

  it("unwraps and returns a usable DEK on first unlock", async () => {
    const prfOutput = randomBytes(32);
    const kek = await deriveKekFromPrf(prfOutput);
    const dekRaw = generateDataKey();
    const wrapped = await wrapDek(kek, dekRaw);
    mockEvalPrf.mockResolvedValue(prfOutput);

    const dek = await getSessionDataKey(async () => ({ wrappedDek: wrapped, credentialId: "cred-1" }));
    expect(dek).not.toBeNull();
    expect(mockEvalPrf).toHaveBeenCalledTimes(1);
  });

  it("caches within the same credential — a second call doesn't re-run the prf ceremony", async () => {
    const prfOutput = randomBytes(32);
    const kek = await deriveKekFromPrf(prfOutput);
    const dekRaw = generateDataKey();
    const wrapped = await wrapDek(kek, dekRaw);
    mockEvalPrf.mockResolvedValue(prfOutput);
    const fetchRecord = async () => ({ wrappedDek: wrapped, credentialId: "cred-1" });

    const first = await getSessionDataKey(fetchRecord);
    const second = await getSessionDataKey(fetchRecord);
    expect(first).toBe(second);
    expect(mockEvalPrf).toHaveBeenCalledTimes(1);
  });

  it("re-derives when the enrolled credential changed since the cache was populated", async () => {
    const prfOutputA = randomBytes(32);
    const dekRawA = generateDataKey();
    const wrappedA = await wrapDek(await deriveKekFromPrf(prfOutputA), dekRawA);
    mockEvalPrf.mockResolvedValueOnce(prfOutputA);
    await getSessionDataKey(async () => ({ wrappedDek: wrappedA, credentialId: "cred-1" }));

    const prfOutputB = randomBytes(32);
    const dekRawB = generateDataKey();
    const wrappedB = await wrapDek(await deriveKekFromPrf(prfOutputB), dekRawB);
    mockEvalPrf.mockResolvedValueOnce(prfOutputB);
    await getSessionDataKey(async () => ({ wrappedDek: wrappedB, credentialId: "cred-2" }));

    expect(mockEvalPrf).toHaveBeenCalledTimes(2);
  });

  it("clearSessionDataKey forces the next call to re-run the ceremony even for the same credential", async () => {
    const prfOutput = randomBytes(32);
    const kek = await deriveKekFromPrf(prfOutput);
    const dekRaw = generateDataKey();
    const wrapped = await wrapDek(kek, dekRaw);
    mockEvalPrf.mockResolvedValue(prfOutput);
    const fetchRecord = async () => ({ wrappedDek: wrapped, credentialId: "cred-1" });

    await getSessionDataKey(fetchRecord);
    clearSessionDataKey();
    await getSessionDataKey(fetchRecord);
    expect(mockEvalPrf).toHaveBeenCalledTimes(2);
  });
});
