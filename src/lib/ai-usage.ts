import type { SupabaseClient } from "@supabase/supabase-js";

/** Rate limit for the Résumé-canvas AI sidebar's free-text/chat path
 * (Pro-tier only — fixed quick-action chips are unrestricted, see
 * PROFILE_QUICK_ACTIONS in src/lib/profile.ts). Placeholder economics, same
 * env-tunable posture as points.ts's OVERRIDE_DAILY_CAP. */
export const AI_REFINE_CHAT_DAILY_CAP = Number(process.env.AI_REFINE_CHAT_DAILY_CAP ?? 20);

/** Custom refine calls (not a fixed quick action) by this profile in the
 * last 24h — same rolling-window-count shape as points.ts's
 * countOverridesToday, not a denormalized counter column. */
export async function countRefineChatCallsToday(
  admin: SupabaseClient,
  profileId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("ai_refine_log")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", since);
  if (error) throw new Error(`refine-chat rate check failed: ${error.message}`);
  return count ?? 0;
}

export async function logRefineChatCall(admin: SupabaseClient, profileId: string): Promise<void> {
  const { error } = await admin.from("ai_refine_log").insert({ profile_id: profileId });
  if (error) throw new Error(`refine-chat log failed: ${error.message}`);
}
