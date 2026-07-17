import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { getBalance } from "@/lib/points";
import { RoleSwitcher } from "@/components/role-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RecruiterDashboard() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [{ data: jobs }, balance] = await Promise.all([
    supabase
      .from("job_postings")
      .select("id, title, status, created_at")
      .eq("recruiter_id", session.userId)
      .order("created_at", { ascending: false }),
    getBalance(supabase, session.userId),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your job postings</h1>
          <p className="text-sm text-muted-foreground">
            Reveals cost points; candidates who opted in reply fast.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" data-testid="points-balance">
            {balance} pts
          </Badge>
          <Button render={<Link href="/recruiter/jobs/new" />}>Post a job</Button>
          <RoleSwitcher
            current="recruiter"
            isSeeker={session.isSeeker}
            isRecruiter={session.isRecruiter}
          />
          <SignOutButton />
        </div>
      </header>

      {(jobs ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No postings yet. Post a job to see matched, pseudonymized candidates.
          </CardContent>
        </Card>
      ) : (
        (jobs ?? []).map((job) => (
          <Card key={job.id}>
            <CardHeader>
              <CardTitle className="text-lg">
                <Link href={`/recruiter/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </CardTitle>
              <CardDescription>
                <Badge
                  variant={
                    job.status === "active"
                      ? "default"
                      : job.status === "draft"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {job.status}
                </Badge>
              </CardDescription>
            </CardHeader>
          </Card>
        ))
      )}
    </main>
  );
}
