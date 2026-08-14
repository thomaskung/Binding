"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { RecoveryCodeInput, RedeemedRecoveryCode, WrappedDataKeyRecord } from "./key-custody-types";

/** Client-held key custody server actions (DESIGN.md §2g, Phase 10). Every
 * function here only ever moves already-wrapped/already-encrypted bytes —
 * none of them can decrypt anything, by construction: the server never
 * holds a KEK or an unwrapped DEK.
 *
 * Shared constants/types live in `./key-custody-types.ts`, NOT here — a
 * `"use server"` module may only export async functions; exporting a plain
 * constant or interface here silently invalidates ALL of this module's
 * exports under Next's production build (a real `next build`/Vercel deploy
 * catches this; `tsc`/Vitest do not, since neither applies that transform). */

export async function getWrappedDataKey(): Promise<WrappedDataKeyRecord | null> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_data_keys")
    .select("wrapped_dek, credential_id")
    .eq("profile_id", session.userId)
    .maybeSingle();
  if (error) throw new Error(`data key lookup failed: ${error.message}`);
  if (!data) return null;
  return { wrappedDek: data.wrapped_dek, credentialId: data.credential_id };
}

export async function isResumeEncryptionEnabled(): Promise<boolean> {
  return (await getWrappedDataKey()) !== null;
}

/** Enroll or re-enroll: upserts the wrapped DEK for this profile. Re-
 * enrollment (a new passkey, e.g. the old one was lost) intentionally
 * overwrites the row — any resume encrypted under the previous wrap is only
 * decryptable by whoever still holds the OLD unwrapped DEK, which the
 * client must have carried over into the new wrap (re-wrap the same DEK
 * under the new KEK) for continuity, or accept that old encrypted resumes
 * become unreadable (surfaced to the user client-side, not enforced here —
 * this action just persists whatever wrap it's given). */
export async function saveWrappedDataKey(wrappedDek: string, credentialId: string): Promise<void> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("user_data_keys").upsert(
    {
      profile_id: session.userId,
      wrapped_dek: wrappedDek,
      credential_id: credentialId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) throw new Error(`data key save failed: ${error.message}`);
  revalidatePath("/seeker/settings/security");
  revalidatePath("/seeker/profile/resume");
}

/** Replaces the full recovery-code set — regenerating invalidates every
 * previously-issued code, same UX as regenerating TOTP backup codes. */
export async function saveRecoveryCodes(codes: RecoveryCodeInput[]): Promise<void> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { error: deleteError } = await admin
    .from("user_data_key_recovery")
    .delete()
    .eq("profile_id", session.userId);
  if (deleteError) throw new Error(`recovery code reset failed: ${deleteError.message}`);

  if (codes.length === 0) return;
  const { error: insertError } = await admin.from("user_data_key_recovery").insert(
    codes.map((c) => ({
      profile_id: session.userId,
      code_hash: c.codeHash,
      wrapped_dek: c.wrappedDek,
      salt: c.salt,
    })),
  );
  if (insertError) throw new Error(`recovery code save failed: ${insertError.message}`);
}

/** Redeem an unused recovery code by hash — one-time use, enforced by
 * filtering on `used_at is null` and marking it used on the same request.
 * The caller (client) still has to derive the same PBKDF2 KEK from the code
 * + returned salt and unwrap `wrappedDek` itself — this action never sees
 * the plaintext code beyond hashing the candidate to look it up. */
export async function redeemRecoveryCode(codeHash: string): Promise<RedeemedRecoveryCode | null> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("user_data_key_recovery")
    .select("id, wrapped_dek, salt")
    .eq("profile_id", session.userId)
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .maybeSingle();
  if (error) throw new Error(`recovery redeem lookup failed: ${error.message}`);
  if (!data) return null;

  const { error: updateError } = await admin
    .from("user_data_key_recovery")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);
  if (updateError) throw new Error(`recovery redeem mark-used failed: ${updateError.message}`);

  return { wrappedDek: data.wrapped_dek, salt: data.salt };
}

const RESUME_ENC_ALGO = "aes-256-gcm-v1";

/** Persists an already-client-encrypted resume: `encryptedRawTextB64` and
 * `encryptedPdfB64` are both `base64(nonce || ciphertext)` blobs the client
 * produced with its unwrapped DEK — this action never sees plaintext. */
export async function storeEncryptedResume(input: {
  encryptedRawTextB64: string;
  encryptedPdfB64: string;
}): Promise<void> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const storagePath = `${session.userId}/${Date.now()}.pdf.enc`;
  await admin.storage.createBucket("resumes", { public: false }).catch(() => {
    /* bucket exists */
  });
  const pdfBytes = Buffer.from(input.encryptedPdfB64, "base64");
  const { error: uploadError } = await admin.storage
    .from("resumes")
    .upload(storagePath, pdfBytes, { contentType: "application/octet-stream" });
  if (uploadError) throw new Error(`encrypted resume upload failed: ${uploadError.message}`);

  const { error: insertError } = await admin.from("resumes").insert({
    profile_id: session.userId,
    storage_path: storagePath,
    raw_text: input.encryptedRawTextB64,
    encrypted: true,
    enc_algo: RESUME_ENC_ALGO,
  });
  if (insertError) throw new Error(`encrypted resume save failed: ${insertError.message}`);

  revalidatePath("/seeker/profile/resume");
}
