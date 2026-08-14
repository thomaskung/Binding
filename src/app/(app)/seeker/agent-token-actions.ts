"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { generateAgentToken, hashAgentToken } from "@/lib/agent-mcp";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/** Agent/API-token management server actions (DESIGN.md §14e, Phase 11).
 * Fills the "Coming soon" placeholder reserved on `/seeker/settings/security`
 * since Phase 6. Constants/types stay inline here (no separate `-types.ts`
 * split needed — everything below is either an async function or a plain
 * data shape used only as a return type, never re-exported as a value from
 * this `"use server"` module — see CLAUDE.md's Gotchas entry from Phase 10
 * on why non-function exports break the production build). */

export interface AgentTokenSummary {
  id: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/** Creating a token requires the agent-access consent to already be granted
 * (src/lib/consent.ts AGENT_ACCESS_CONSENT_VERSION) — same "consent gates
 * the connect action" shape as Google Drive's authorize route. */
export interface CreatedAgentToken {
  id: string;
  token: string;
}

/** Returns the real row id alongside the raw token — the caller (the
 * settings-page card) needs the real id for its optimistic UI update, not a
 * client-fabricated placeholder that a same-session Revoke click would then
 * silently fail to match (a zero-row `.update().eq("id", ...)` succeeds
 * without error in PostgREST, so a fake id would make Revoke a silent
 * no-op — the token would stay live while the UI shows it revoked). */
export async function createAgentToken(label: string | null): Promise<CreatedAgentToken> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data: consent } = await admin
    .from("consent_flags")
    .select("agent_access_opt_in_at")
    .eq("profile_id", session.userId)
    .maybeSingle();
  if (!consent?.agent_access_opt_in_at) {
    throw new Error("agent access consent required before creating a token");
  }

  const token = generateAgentToken();
  const { data, error } = await admin
    .from("agent_tokens")
    .insert({
      profile_id: session.userId,
      token_hash: hashAgentToken(token),
      label: label?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`token creation failed: ${error?.message ?? "no row returned"}`);

  revalidatePath("/seeker/settings/security");
  return { id: data.id, token }; // token shown to the caller exactly once — never retrievable again
}

export async function listAgentTokens(): Promise<AgentTokenSummary[]> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("agent_tokens")
    .select("id, label, created_at, revoked_at, last_used_at")
    .eq("profile_id", session.userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`token list failed: ${error.message}`);

  return (data ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    createdAt: t.created_at,
    revokedAt: t.revoked_at,
    lastUsedAt: t.last_used_at,
  }));
}

export async function revokeAgentToken(id: string): Promise<void> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("agent_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", session.userId);
  if (error) throw new Error(`token revoke failed: ${error.message}`);
  revalidatePath("/seeker/settings/security");
}
