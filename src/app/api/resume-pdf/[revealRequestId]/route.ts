import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { candidateLabel, seniorityChip } from "@/lib/candidate-card";
import { getSessionProfile } from "@/lib/auth";
import { stripPiiPatterns } from "@/lib/pii-patterns";
import { regionFromLocation } from "@/lib/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/** Redacted-résumé download (recruiter, post-reveal). Built from the
 * pseudonymized/structured profile — NEVER `resumes.raw_text`. Contact details
 * are already absent from redacted_text; we still run stripPiiPatterns as
 * defense-in-depth. NO salary (fairness — the recruiter hasn't shared the
 * role's budget). Authorized only for the recruiter who owns an accepted /
 * revealed reveal_request. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ revealRequestId: string }> },
) {
  const { revealRequestId } = await params;
  const session = await getSessionProfile();
  if (!session?.isRecruiter) {
    return NextResponse.json({ error: "recruiter session required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: reveal } = await admin
    .from("reveal_requests")
    .select("id, profile_id, recruiter_id, status")
    .eq("id", revealRequestId)
    .maybeSingle();
  if (!reveal || reveal.recruiter_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!["accepted", "revealed"].includes(reveal.status)) {
    // Identity not (yet) disclosed on this request — no résumé.
    return NextResponse.json({ error: "candidate not revealed" }, { status: 403 });
  }

  const [{ data: profile }, { data: vector }] = await Promise.all([
    admin
      .from("profiles")
      .select("display_name, skills, industries, desired_roles, seniority_band, years_experience, location, credentials_summary")
      .eq("id", reveal.profile_id)
      .maybeSingle(),
    admin.from("skill_vectors").select("redacted_text").eq("profile_id", reveal.profile_id).maybeSingle(),
  ]);
  if (!profile) return NextResponse.json({ error: "profile unavailable" }, { status: 404 });

  const region = regionFromLocation(profile.location ?? "") || null;
  const label = candidateLabel({
    desiredRoles: profile.desired_roles,
    seniorityBand: profile.seniority_band,
    region,
    yearsExperience: profile.years_experience,
  });
  // Defense-in-depth: the redacted body is already contact-free; strip again.
  const body = stripPiiPatterns(vector?.redacted_text ?? "").text;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); // A4
  const margin = 56;
  const maxWidth = 595 - margin * 2;
  let y = 842 - margin;

  const gray = rgb(0.42, 0.42, 0.42);
  const black = rgb(0.1, 0.1, 0.1);

  const wrap = (text: string, f: typeof font, size: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of text.split(/\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const trial = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(trial, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const draw = (text: string, { size = 11, f = font, color = black, gap = 4 } = {}) => {
    for (const line of wrap(text, f, size)) {
      if (y < margin + size) {
        page = pdf.addPage([595, 842]);
        y = 842 - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + gap;
    }
  };

  draw(profile.display_name ?? "Candidate", { size: 20, f: bold });
  draw(label, { size: 11, color: gray, gap: 10 });

  const senChip = seniorityChip(profile.seniority_band, profile.years_experience);
  if (senChip) draw(`Experience:  ${senChip}${region ? ` · ${region}` : ""}`, { gap: 6 });
  if (profile.industries?.length) draw(`Industries:  ${profile.industries.join(", ")}`, { gap: 6 });
  if (profile.skills?.length) draw(`Skills:  ${profile.skills.join(", ")}`, { gap: 6 });
  if (profile.credentials_summary) draw(`Credentials:  ${profile.credentials_summary}`, { gap: 10 });

  if (body.trim()) {
    draw("Profile", { size: 13, f: bold, gap: 6 });
    draw(body, { size: 10, color: gray });
  }

  draw("", { gap: 8 });
  draw(
    "Contact details removed. Salary expectations withheld until the role's budget is shared.",
    { size: 8, color: gray },
  );

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="candidate-${reveal.profile_id.slice(0, 8)}.pdf"`,
    },
  });
}
