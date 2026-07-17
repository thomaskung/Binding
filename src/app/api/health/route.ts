import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/** Health check. Doubles as the keepalive target: the GitHub Actions cron
 * (.github/workflows/keepalive.yml) hits this every 3 days so the Supabase
 * free-tier project never crosses the 7-day inactivity pause. The count query
 * is what registers as database activity. */
export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, db: "reachable" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 503 },
    );
  }
}
