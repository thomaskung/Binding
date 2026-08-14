import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchBand, type SeekerTier } from "@/lib/matching";
import { getBalance } from "@/lib/points";

/**
 * Personal-agent MCP, thin read-only slice (DESIGN.md §14e, Phase 11).
 * Hand-rolled JSON-RPC (no `@modelcontextprotocol/sdk` dependency yet, per
 * the build plan) exposing exactly 3 read-only tools. No write actions, no
 * rule-based auto-reply, no kill switch beyond consent withdrawal, no
 * webhooks — all explicitly deferred.
 *
 * `handleMcpRequest` is decomposed out of the route handler
 * (src/app/api/mcp/route.ts) specifically so it's unit-testable without
 * spinning up Next's route machinery — the route only owns auth/cap/logging,
 * this owns the protocol + tool dispatch.
 */

export const AGENT_CALLS_DAILY_CAP = Number(process.env.AGENT_CALLS_DAILY_CAP ?? 100);

const TOKEN_PREFIX = "bnd_agent_";

/** Raw bearer token shown to the user exactly once at creation. Prefixed so
 * a leaked token is recognizable in logs/scans, same convention as most
 * real API-token schemes. */
export function generateAgentToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

/** sha256 hex digest — what's actually stored (`agent_tokens.token_hash`).
 * The raw token is never persisted; auth re-hashes the candidate bearer
 * value and looks up by hash. */
export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Agent calls (by this profile, across all its tokens) in the last 24h —
 * counted per PROFILE, not per token, so issuing more tokens can't raise the
 * effective cap. Mirrors `countStandardRevealsToday`'s shape in points.ts. */
export async function agentCallsToday(admin: SupabaseClient, profileId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("agent_access_log")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("accessed_at", since);
  if (error) throw new Error(`agent call count failed: ${error.message}`);
  return count ?? 0;
}

/** Pure cap guard, same "cap-checked-before-anything-else" shape as
 * `revealSpendGuard` in points.ts — extracted so the route handler's cap
 * logic is unit-testable without a running server. Returns the error
 * message to respond with, or null if the call may proceed. */
export function agentCallCapGuard(usedToday: number, dailyCap: number): string | null {
  if (usedToday >= dailyCap) {
    return `daily agent call limit reached (${dailyCap}/day)`;
  }
  return null;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: "get_match_status",
    description: "List this seeker's current job matches with their qualitative band (never a raw score).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_profile_summary",
    description: "Summary of this seeker's own profile — headline, skills, desired roles, seniority.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_points_balance",
    description: "This seeker's current points balance.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

interface McpContext {
  admin: SupabaseClient;
  profileId: string;
}

async function getMatchStatusTool({ admin, profileId }: McpContext) {
  const { data: profile } = await admin
    .from("profiles")
    .select("seeker_tier")
    .eq("id", profileId)
    .maybeSingle();
  const tier: SeekerTier = profile?.seeker_tier === "pro" ? "pro" : "free";

  const { data: matches, error } = await admin
    .from("matches")
    .select("status, score, created_at, job_postings(title)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`match status lookup failed: ${error.message}`);

  return {
    matches: (matches ?? []).map((m) => {
      const jobPosting = (m.job_postings as unknown as { title: string }[] | { title: string } | null) ?? null;
      const title = Array.isArray(jobPosting) ? (jobPosting[0]?.title ?? null) : (jobPosting?.title ?? null);
      return { jobTitle: title, status: m.status, band: matchBand(m.score, tier), createdAt: m.created_at };
    }),
  };
}

async function getProfileSummaryTool({ admin, profileId }: McpContext) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("display_name, headline, skills, desired_roles, industries, seniority_band, years_experience, seeker_tier")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(`profile summary lookup failed: ${error.message}`);
  if (!profile) throw new Error("profile not found");

  return {
    displayName: profile.display_name,
    headline: profile.headline,
    skills: profile.skills ?? [],
    desiredRoles: profile.desired_roles ?? [],
    industries: profile.industries ?? [],
    seniorityBand: profile.seniority_band,
    yearsExperience: profile.years_experience,
    seekerTier: profile.seeker_tier === "pro" ? "pro" : "free",
  };
}

async function getPointsBalanceTool({ admin, profileId }: McpContext) {
  return { balance: await getBalance(admin, profileId) };
}

const TOOL_EXECUTORS: Record<string, (ctx: McpContext) => Promise<unknown>> = {
  get_match_status: getMatchStatusTool,
  get_profile_summary: getProfileSummaryTool,
  get_points_balance: getPointsBalanceTool,
};

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Pure JSON-RPC 2.0 dispatcher — `tools/list` (the 3 tools above) and
 * `tools/call` (dispatches by name, executed against `ctx`). Every error
 * path returns a well-formed JSON-RPC error object rather than throwing, so
 * the route handler never needs its own try/catch around this call. */
export async function handleMcpRequest(body: JsonRpcRequest, ctx: McpContext): Promise<JsonRpcResponse> {
  const id = body.id ?? null;

  if (body.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
  }

  if (body.method === "tools/call") {
    const name = body.params?.name;
    const executor = name ? TOOL_EXECUTORS[name] : undefined;
    if (!executor) {
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool: ${name ?? "(none)"}` } };
    }
    try {
      const result = await executor(ctx);
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: e instanceof Error ? e.message : "tool execution failed" },
      };
    }
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method: ${body.method ?? "(none)"}` } };
}
