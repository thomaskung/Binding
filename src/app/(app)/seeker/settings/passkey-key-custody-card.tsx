"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@binding/ui";
import {
  deriveKekFromPrf,
  deriveKekFromRecoveryCode,
  fromBase64,
  generateDataKey,
  generateRecoveryCode,
  hashRecoveryCode,
  randomBytes,
  toBase64,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto/envelope";
import { clearSessionDataKey } from "@/lib/crypto/session-key";
import { enrollPasskey, evalPrf, hasWebAuthnSupport } from "@/lib/crypto/webauthn-prf";
import {
  RECOVERY_CODE_COUNT,
  getWrappedDataKey,
  redeemRecoveryCode,
  saveRecoveryCodes,
  saveWrappedDataKey,
  type RecoveryCodeInput,
} from "../key-custody-actions";

interface Props {
  displayName: string;
  initiallyEnrolled: boolean;
}

/** Wraps one raw DEK under RECOVERY_CODE_COUNT fresh one-time codes and
 * persists them (replacing any existing set) — the shared tail of both
 * initial enrollment and "regenerate recovery codes". Returns the plaintext
 * codes for the one-time reveal screen. */
async function generateAndPersistRecoveryCodes(dekRaw: Uint8Array): Promise<string[]> {
  const codes: string[] = [];
  const rows: RecoveryCodeInput[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateRecoveryCode();
    const salt = randomBytes(16);
    const recoveryKek = await deriveKekFromRecoveryCode(code, salt);
    const wrappedForCode = await wrapDek(recoveryKek, dekRaw);
    codes.push(code);
    rows.push({ codeHash: await hashRecoveryCode(code), wrappedDek: wrappedForCode, salt: toBase64(salt) });
  }
  await saveRecoveryCodes(rows);
  return codes;
}

/** Fills the "Coming soon" passkey placeholder reserved on this page since
 * Phase 6 (data-testid="passkey-placeholder-card") with the real Phase 10
 * enrollment flow (DESIGN.md §2g). Client component: the whole point is that
 * key material is generated/wrapped/unwrapped in the browser and never sent
 * to the server unwrapped.
 *
 * Three flows, all driving the same underlying `user_data_keys` row:
 * - `enroll()` — first-time setup: new DEK, wrapped by a new passkey + a
 *   fresh set of recovery codes.
 * - `regenerateCodes()` — unwraps the EXISTING DEK via THIS device's already-
 *   enrolled passkey, re-wraps it under a fresh code set. Requires a working
 *   passkey on this device — if you don't have one, use recovery instead.
 * - `redeemCode()` — the escape hatch when this device has no working
 *   passkey: unwraps the DEK via a one-time recovery code, then enrolls a
 *   NEW passkey and re-wraps the SAME DEK under it, so previously-encrypted
 *   resumes stay decryptable. */
export function PasskeyKeyCustodyCard({ displayName, initiallyEnrolled }: Props) {
  const [enrolled, setEnrolled] = useState(initiallyEnrolled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      if (!hasWebAuthnSupport()) {
        setError("Passkey encryption isn't supported by this browser.");
        return;
      }
      const enrollment = await enrollPasskey(displayName);
      if (!enrollment) {
        setError(
          "Your device/browser registered a passkey but doesn't support the encryption extension it needs (prf) — resume encryption isn't available here.",
        );
        return;
      }
      const kek = await deriveKekFromPrf(enrollment.prfOutput);
      const dekRaw = generateDataKey();
      const wrappedDek = await wrapDek(kek, dekRaw);
      await saveWrappedDataKey(wrappedDek, enrollment.credentialId);

      const codes = await generateAndPersistRecoveryCodes(dekRaw);
      clearSessionDataKey();
      setRecoveryCodes(codes);
      setEnrolled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  }

  /** Unwraps the current DEK via this device's already-enrolled passkey —
   * NOT via the session cache (src/lib/crypto/session-key.ts), which only
   * holds a non-extractable CryptoKey usable for encrypt/decrypt, not for
   * re-wrapping under a new KEK. Regenerating needs the raw bytes. */
  async function unwrapCurrentRawDek(): Promise<Uint8Array | null> {
    const record = await getWrappedDataKey();
    if (!record) return null;
    const prfOutput = await evalPrf(record.credentialId);
    if (!prfOutput) return null;
    const kek = await deriveKekFromPrf(prfOutput);
    return unwrapDek(kek, record.wrappedDek);
  }

  async function regenerateCodes() {
    setBusy(true);
    setError(null);
    try {
      const dekRaw = await unwrapCurrentRawDek();
      if (!dekRaw) {
        setError("Couldn't unlock your key with this device's passkey — if it's lost, use recovery instead.");
        return;
      }
      const codes = await generateAndPersistRecoveryCodes(dekRaw);
      setRecoveryCodes(codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerating codes failed");
    } finally {
      setBusy(false);
    }
  }

  async function redeemCode() {
    setBusy(true);
    setError(null);
    try {
      const code = recoveryInput.trim();
      if (!code) {
        setError("Enter a recovery code.");
        return;
      }
      const redeemed = await redeemRecoveryCode(await hashRecoveryCode(code));
      if (!redeemed) {
        setError("That code is invalid or has already been used.");
        return;
      }
      const recoveryKek = await deriveKekFromRecoveryCode(code, fromBase64(redeemed.salt));
      const dekRaw = await unwrapDek(recoveryKek, redeemed.wrappedDek);

      if (!hasWebAuthnSupport()) {
        setError("Recovered your key, but this browser can't enroll a new passkey to hold it — try a supported device.");
        return;
      }
      const enrollment = await enrollPasskey(displayName);
      if (!enrollment) {
        setError("Recovered your key, but couldn't enroll a new passkey on this device (no `prf` support).");
        return;
      }
      const newKek = await deriveKekFromPrf(enrollment.prfOutput);
      const newWrappedDek = await wrapDek(newKek, dekRaw);
      await saveWrappedDataKey(newWrappedDek, enrollment.credentialId);
      clearSessionDataKey();

      setRecoverySuccess(true);
      setRecovering(false);
      setRecoveryInput("");
      setEnrolled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadCodes() {
    if (!recoveryCodes) return;
    const blob = new Blob(
      [
        `Binding resume-encryption recovery codes\nGenerated ${new Date().toISOString()}\n\n`,
        recoveryCodes.join("\n"),
        "\n\nEach code works once. Losing every enrolled passkey AND these codes means your encrypted resume can never be decrypted again.\n",
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "binding-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (recoveryCodes) {
    return (
      <Card className="jb-lift" data-testid="recovery-codes-card">
        <CardHeader>
          <CardTitle className="text-sm">Save your recovery codes</CardTitle>
          <CardDescription>
            Shown once. If you lose every passkey, one of these is the only way back into your
            encrypted resume.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid grid-cols-2 gap-1.5 font-mono text-xs" data-testid="recovery-codes-list">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <Button onClick={downloadCodes} data-testid="download-recovery-codes">
            Download codes
          </Button>
          <Button variant="outline" onClick={() => setRecoveryCodes(null)} data-testid="recovery-codes-saved">
            I&apos;ve saved these
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="jb-lift" data-testid="passkey-placeholder-card">
      <CardHeader>
        <CardTitle className="text-sm">Passkeys &amp; recovery codes</CardTitle>
        <CardDescription>
          {enrolled
            ? "Resume encryption is on — your original uploaded file is encrypted in your browser before it's stored. (Your editable résumé draft still saves as normal text, since that's what powers matching.)"
            : "Encrypt your original uploaded résumé file with a passkey-derived key we can never read (DESIGN.md §2g)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {enrolled ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-testid="resume-encryption-enabled-badge">
              Enabled
            </Badge>
            <Button variant="outline" size="sm" onClick={regenerateCodes} disabled={busy} data-testid="regenerate-recovery-codes">
              {busy ? "Working…" : "Regenerate recovery codes"}
            </Button>
          </div>
        ) : (
          <Button onClick={enroll} disabled={busy} data-testid="enable-resume-encryption">
            {busy ? "Setting up…" : "Enable resume encryption"}
          </Button>
        )}

        {recoverySuccess && (
          <p className="text-sm text-muted-foreground" data-testid="recovery-success-message">
            New passkey enrolled on this device — your encrypted resume is accessible again.
          </p>
        )}

        {recovering ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">
              Enter one of your one-time recovery codes. This enrolls a new passkey on this device
              and keeps your existing encrypted resume readable.
            </p>
            <div className="flex gap-2">
              <Input
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                data-testid="recovery-code-input"
              />
              <Button onClick={redeemCode} disabled={busy} data-testid="submit-recovery-code">
                {busy ? "Recovering…" : "Recover"}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRecovering(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          enrolled && (
            <Button variant="ghost" size="sm" onClick={() => setRecovering(true)} data-testid="start-recovery">
              Lost access to your passkey?
            </Button>
          )
        )}

        {error && (
          <p className="text-sm text-destructive" data-testid="resume-encryption-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
