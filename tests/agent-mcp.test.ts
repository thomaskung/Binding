import { describe, expect, it } from "vitest";
import { agentCallCapGuard, generateAgentToken, handleMcpRequest, hashAgentToken, MCP_TOOLS } from "@/lib/agent-mcp";

describe("agentCallCapGuard", () => {
  it("allows the call when under cap", () => {
    expect(agentCallCapGuard(5, 100)).toBeNull();
  });

  it("blocks exactly at cap, not just over it", () => {
    expect(agentCallCapGuard(100, 100)).toMatch(/daily agent call limit reached/);
  });

  it("blocks over cap", () => {
    expect(agentCallCapGuard(150, 100)).toMatch(/100\/day/);
  });
});

interface FakeData {
  profile?: Record<string, unknown> | null;
  matches?: unknown[];
  balance?: { balance: number } | null;
  throwOnProfile?: boolean;
}

/** Minimal fake mirroring just enough of the supabase-js query-builder shape
 * that agent-mcp.ts's three tools call: chainable select/eq/order/limit,
 * `.maybeSingle()` for single-row lookups (profiles, points_balances), and
 * the chain itself thenable (PostgREST-style) for the multi-row `matches`
 * lookup, which never calls `.maybeSingle()`. */
function fakeAdmin(data: FakeData) {
  function chain(table: string) {
    const resolveList = () => Promise.resolve({ data: table === "matches" ? (data.matches ?? []) : [], error: null });
    const self = {
      select: () => self,
      eq: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => {
        if (data.throwOnProfile) throw new Error("db unavailable");
        if (table === "profiles") return { data: data.profile ?? null, error: null };
        if (table === "points_balances") return { data: data.balance ?? null, error: null };
        return { data: null, error: null };
      },
      then: (onFulfilled: (v: { data: unknown; error: null }) => unknown) => resolveList().then(onFulfilled),
    };
    return self;
  }
  return { from: chain } as unknown as Parameters<typeof handleMcpRequest>[1]["admin"];
}

describe("generateAgentToken / hashAgentToken", () => {
  it("generates a recognizably-prefixed, unique token each call", () => {
    const a = generateAgentToken();
    const b = generateAgentToken();
    expect(a).toMatch(/^bnd_agent_[0-9a-f]+$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically and never reveals the token in the hash", () => {
    const token = "bnd_agent_abc123";
    const hashA = hashAgentToken(token);
    const hashB = hashAgentToken(token);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toContain(token);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("handleMcpRequest — JSON-RPC dispatcher", () => {
  it("tools/list returns exactly the 3 read-only tools", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { admin: fakeAdmin({}), profileId: "p1" },
    );
    expect(res.error).toBeUndefined();
    const tools = (res.result as { tools: typeof MCP_TOOLS }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["get_match_status", "get_points_balance", "get_profile_summary"].sort(),
    );
  });

  it("tools/call with an unknown tool name returns a JSON-RPC error, not a throw", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "delete_everything" } },
      { admin: fakeAdmin({}), profileId: "p1" },
    );
    expect(res.result).toBeUndefined();
    expect(res.error?.message).toMatch(/unknown tool/);
  });

  it("an unknown method returns a JSON-RPC error", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "something/else" },
      { admin: fakeAdmin({}), profileId: "p1" },
    );
    expect(res.error?.message).toMatch(/unknown method/);
  });

  it("get_points_balance calls through to the real balance lookup", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_points_balance" } },
      { admin: fakeAdmin({ balance: { balance: 42 } }), profileId: "p1" },
    );
    expect(res.result).toEqual({ balance: 42 });
  });

  it("get_profile_summary returns only the fields it selects — no raw resume/contact fields", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_profile_summary" } },
      {
        admin: fakeAdmin({
          profile: {
            display_name: "Jamie",
            headline: "Backend engineer",
            skills: ["Go", "Postgres"],
            desired_roles: ["Backend"],
            industries: ["Fintech"],
            seniority_band: "senior",
            years_experience: 8,
            seeker_tier: "free",
          },
        }),
        profileId: "p1",
      },
    );
    expect(res.result).toEqual({
      displayName: "Jamie",
      headline: "Backend engineer",
      skills: ["Go", "Postgres"],
      desiredRoles: ["Backend"],
      industries: ["Fintech"],
      seniorityBand: "senior",
      yearsExperience: 8,
      seekerTier: "free",
    });
    expect(JSON.stringify(res.result)).not.toMatch(/email|phone|resume/i);
  });

  it("get_match_status returns a band, never the raw cosine score", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_match_status" } },
      {
        admin: fakeAdmin({
          profile: { seeker_tier: "free" },
          matches: [
            { status: "surfaced", score: 0.91, created_at: "2026-08-14T00:00:00Z", job_postings: { title: "Backend Engineer" } },
          ],
        }),
        profileId: "p1",
      },
    );
    const result = res.result as { matches: Array<{ jobTitle: string | null; band: string; status: string }> };
    expect(result.matches).toHaveLength(1);
    const [match] = result.matches;
    if (!match) throw new Error("expected one match");
    expect(match).toMatchObject({ jobTitle: "Backend Engineer", status: "surfaced" });
    expect(match.band).toMatch(/^(high|normal|low)$/);
    expect(JSON.stringify(result)).not.toContain("0.91");
  });

  it("a tool execution failure becomes a JSON-RPC error, not an unhandled rejection", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_profile_summary" } },
      { admin: fakeAdmin({ throwOnProfile: true }), profileId: "p1" },
    );
    expect(res.result).toBeUndefined();
    expect(res.error).toBeDefined();
  });
});

describe("MCP_TOOLS", () => {
  it("every tool has a non-empty name and description", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});
