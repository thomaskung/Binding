import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthNav } from "@/components/auth-nav";
import { Button } from "@jumponboard/ui";
import { getSessionProfile } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getSessionProfile();
  if (session) {
    if (!session.onboarded) redirect("/onboarding");
    // Dual-role home: last-used role wins (cookie set by the role switcher);
    // fall back to seeker when both, else whichever role exists.
    const lastRole = (await cookies()).get("job_active_role")?.value;
    if (lastRole === "recruiter" && session.isRecruiter) redirect("/recruiter");
    if (lastRole === "seeker" && session.isSeeker) redirect("/seeker");
    redirect(session.isSeeker ? "/seeker" : "/recruiter");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AuthNav context="landing" />
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">JumpOnBoard</h1>
        <p className="text-lg text-muted-foreground">
          Privacy-first hiring for APAC. Match on skills and compensation fit —
          before anyone sees your name.
        </p>
        <div className="flex gap-4">
          <Button size="lg" data-testid="cta-seeker" render={<Link href="/signup?intent=seeker" />}>
            Sign up to find a job
          </Button>
          <Button
            size="lg"
            variant="outline"
            data-testid="cta-recruiter"
            render={<Link href="/signup?intent=recruiter" />}
          >
            Sign up to hire talent
          </Button>
        </div>
      </main>
    </div>
  );
}
