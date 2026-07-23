import { requireRole } from "@/lib/auth";
import { getBalance } from "@/lib/points";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RecruiterProfileEditor } from "./recruiter-profile-editor";

export default async function RecruiterProfilePage() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: jobs }, balance, { data: ledger }, { data: userData }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, recruiter_title, company_name, company_industry, company_size, phone")
        .eq("id", session.userId)
        .single(),
      supabase
        .from("job_postings")
        .select("id, title, status, location")
        .eq("recruiter_id", session.userId)
        .order("created_at", { ascending: false }),
      getBalance(supabase, session.userId),
      supabase
        .from("points_ledger")
        .select("event, amount, note, created_at")
        .eq("profile_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.auth.getUser(),
    ]);

  return (
    <RecruiterProfileEditor
      displayName={profile?.display_name ?? ""}
      recruiterTitle={profile?.recruiter_title ?? ""}
      companyName={profile?.company_name ?? ""}
      companyIndustry={profile?.company_industry ?? ""}
      companySize={profile?.company_size ?? null}
      phone={profile?.phone ?? ""}
      email={userData?.user?.email ?? ""}
      jobs={(jobs ?? []).map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        location: j.location,
      }))}
      pointsBalance={balance}
      pointsHistory={(ledger ?? []).map((l) => ({
        label: l.note ?? l.event,
        delta: l.amount > 0 ? `+${l.amount}` : `${l.amount}`,
      }))}
    />
  );
}
