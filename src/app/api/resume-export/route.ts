import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import {
  buildResumeExportData,
  generateResumePlainText,
  generateResumePdfBytes,
  resolveExportOptions,
  type ExportFormat,
} from "@/lib/resume-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resume export endpoint — seeker self-export of their own profile.
 * Server-side enforces tier gate (never trusts client claim).
 * POST body: { format: "pdf" | "plaintext", layout?: string, accent?: string }
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.isSeeker) {
    return NextResponse.json({ error: "seeker session required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      format?: string;
      layout?: string;
      accent?: string;
    };
    const format = (body.format ?? "plaintext") as ExportFormat;
    if (!["pdf", "plaintext"].includes(format)) {
      return NextResponse.json({ error: "invalid format" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    // Fetch the caller's profile + seeker_tier directly (server-side truth)
    const [{ data: profile }, { data: experience }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, headline, skills, desired_roles, industries, seeker_tier")
        .eq("id", session.userId)
        .single(),
      supabase
        .from("seeker_experience")
        .select("role, company, industry, start_date, end_date")
        .eq("profile_id", session.userId),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    // Server-side tier gate (never trust the client)
    const tier = profile.seeker_tier === "pro" ? "pro" : "free";

    // Clamp export options based on actual tier
    const options = resolveExportOptions(
      tier,
      body.layout || body.accent ? { layout: body.layout, accent: body.accent } : undefined,
    );

    // Build export data
    const data = buildResumeExportData({
      displayName: profile.display_name ?? "Candidate",
      headline: profile.headline ?? null,
      skills: profile.skills ?? [],
      desiredRoles: profile.desired_roles ?? [],
      industries: profile.industries ?? [],
      experience: (experience ?? []).map((e) => ({
        role: e.role,
        company: e.company,
        startDate: e.start_date,
        endDate: e.end_date,
        industry: e.industry,
      })),
    });

    if (format === "plaintext") {
      const text = generateResumePlainText(data, options, tier);
      return new NextResponse(text, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="${profile.display_name ?? "resume"}-resume.txt"`,
        },
      });
    }

    // PDF format
    const bytes = await generateResumePdfBytes(data, options, tier);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${profile.display_name ?? "resume"}-resume.pdf"`,
      },
    });
  } catch (error) {
    console.error("resume export error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "export failed" },
      { status: 500 },
    );
  }
}
