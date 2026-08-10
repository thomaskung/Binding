import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthNav } from "@/components/auth-nav";
import { Button } from "@binding/ui";
import { getSessionProfile } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getSessionProfile();
  if (session) {
    if (!session.onboarded) redirect("/onboarding");
    const lastRole = (await cookies()).get("job_active_role")?.value;
    if (lastRole === "recruiter" && session.isRecruiter) redirect("/recruiter");
    if (lastRole === "seeker" && session.isSeeker) redirect("/seeker");
    redirect(session.isSeeker ? "/seeker" : "/recruiter");
  }

  return (
    <div className="jb-fade flex min-h-screen flex-col">
      <AuthNav context="landing" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {/* Hero */}
        <section className="flex flex-col items-center gap-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent px-3 py-1">
            <span className="inline-block h-2 w-2 rounded-full bg-primary"></span>
            <span className="text-sm text-primary font-medium">Private beta · Hong Kong & Singapore</span>
          </div>

          <h1 className="max-w-2xl font-heading text-6xl font-bold tracking-tight leading-[1.05] md:text-7xl">
            Match on merit. Reveal on consent.
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground">
            Privacy-first, AI-driven hiring for APAC. Candidates and companies match on
            skills and pay fit — before a single name is exposed. No cold outbound. No salary anchoring.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" data-testid="cta-seeker" render={<Link href="/signup?intent=seeker" />}>
              Find a job privately
            </Button>
            <Button
              size="lg"
              variant="outline"
              data-testid="cta-recruiter"
              render={<Link href="/signup?intent=recruiter" />}
            >
              Hire verified talent
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            ◆ Pseudonymized by default   ◆ Consent-gated reveals   ◆ Ad-free by design
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20">
          <div className="text-center mb-12">
            <h2 className="text-xs font-semibold tracking-widest text-primary uppercase">How it works</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-4">
            <div className="jb-lift rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                1
              </div>
              <h3 className="font-semibold text-foreground">Upload your resume</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                AI redacts identifying details before anything else happens.
              </p>
            </div>

            <div className="jb-lift rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                2
              </div>
              <h3 className="font-semibold text-foreground">Get matched on merit</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your pseudonymized profile is matched on skills, experience, industry,
                and fit — a banded score, never a raw percentage.
              </p>
            </div>

            <div className="jb-lift rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                3
              </div>
              <h3 className="font-semibold text-foreground">Recruiters see fit, not identity</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                A pseudonymized card carries the real signal: zero names,
                zero contact details.
              </p>
            </div>

            <div className="jb-lift rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                4
              </div>
              <h3 className="font-semibold text-foreground">You choose to reveal</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing moves to a name or a conversation without your explicit
                consent.
              </p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-20">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <div className="font-heading text-4xl font-semibold text-foreground">0</div>
              <p className="mt-3 text-sm text-muted-foreground">
                names exposed before mutual consent
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <div className="font-heading text-4xl font-semibold text-primary">10 credits</div>
              <p className="mt-3 text-sm text-muted-foreground">
                a standard reveal, no per-hire commission, ever
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <div className="font-heading text-4xl font-semibold text-foreground">≥20</div>
              <p className="mt-3 text-sm text-muted-foreground">
                k-anonymity floor before any market signal is shown
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <div className="font-heading text-4xl font-semibold text-foreground">28.6%</div>
              <p className="mt-3 text-sm text-muted-foreground">
                HK gender pay gap that salary anchoring perpetuates
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Binding · Privacy-first hiring for Hong Kong · getbinding.com
      </footer>
    </div>
  );
}
