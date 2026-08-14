import { NextResponse } from "next/server";
import {
  AGENT_CALLS_DAILY_CAP,
  agentCallCapGuard,
  agentCallsToday,
  handleMcpRequest,
  hashAgentToken,
  type JsonRpcRequest,
} from "@/lib/agent-mcp";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Personal-agent MCP endpoint (DESIGN.md §14e, Phase 11). Bearer-token
 * auth (Authorization: Bearer bnd_agent_...), hand-rolled JSON-RPC — no
 * `@modelcontextprotocol/sdk` dependency this phase. This route owns
 * auth/consent/cap/logging; the protocol + tool dispatch itself lives in
 * `handleMcpRequest` (src/lib/agent-mcp.ts) so that piece is unit-testable
 * without a running Next server.
 *
 * Daily call cap (AGENT_CALLS_DAILY_CAP) is checked BEFORE any tool logic
 * runs, same cap-first discipline as revealSpendGuard elsewhere. Consent is
 * re-checked on every call (not just at token-creation time) — withdrawing
 * agent_access consent is this phase's kill switch: it silently disables
 * every already-issued token rather than requiring a separate revoke-all
 * mechanism, since no dedicated kill switch is built this phase (named
 * roadmap item, DESIGN.md §14e).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) {
    return NextResponse.json({ error: "missing or malformed Authorization: Bearer token" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();

  const { data: tokenRow, error: tokenError } = await admin
    .from("agent_tokens")
    .select("id, profile_id, revoked_at")
    .eq("token_hash", hashAgentToken(token))
    .maybeSingle();
  if (tokenError) {
    return NextResponse.json({ error: `token lookup failed: ${tokenError.message}` }, { status: 500 });
  }
  if (!tokenRow || tokenRow.revoked_at) {
    return NextResponse.json({ error: "invalid or revoked token" }, { status: 401 });
  }

  const { data: consent } = await admin
    .from("consent_flags")
    .select("agent_access_opt_in_at")
    .eq("profile_id", tokenRow.profile_id)
    .maybeSingle();
  if (!consent?.agent_access_opt_in_at) {
    return NextResponse.json({ error: "agent access consent has been withdrawn" }, { status: 403 });
  }

  const usedToday = await agentCallsToday(admin, tokenRow.profile_id);
  const capError = agentCallCapGuard(usedToday, AGENT_CALLS_DAILY_CAP);
  if (capError) {
    return NextResponse.json({ error: capError }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body) {
    return NextResponse.json({ error: "invalid JSON-RPC request body" }, { status: 400 });
  }

  const response = await handleMcpRequest(body, { admin, profileId: tokenRow.profile_id });

  const toolName = body.method === "tools/call" ? (body.params?.name ?? "unknown") : body.method ?? "unknown";
  await admin.from("agent_access_log").insert({
    profile_id: tokenRow.profile_id,
    agent_token_id: tokenRow.id,
    tool: toolName,
  });
  await admin.from("agent_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

  return NextResponse.json(response);
}
