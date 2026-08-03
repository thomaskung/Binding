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
    <div className="flex min-h-screen flex-col">
      <AuthNav context="landing" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {/* Hero */}
        <section className="flex flex-col items-center gap-6 py-20 text-center">
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight">
            Get matched on your skills.
            <br />
            <span className="text-muted-foreground">Not on who you are, how old you are, or what you were last paid.</span>
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Binding is a privacy-first, AI-driven hiring platform for Hong Kong.
            Your identity, current salary, and employer stay confidential until
            <em> both</em> sides express interest.
          </p>
          <div className="flex gap-4">
            <Button size="lg" data-testid="cta-seeker" render={<Link href="/signup?intent=seeker" />}>
              Find a job — privacy-first
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
        </section>

        {/* Three pillars */}
        <section className="grid gap-6 py-12 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-medium">1. Private AI matching</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your resume is processed by our own self-hosted AI — never a
              third-party API. Names, employers, and contact details are redacted
              before any matching happens.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-medium">2. No salary anchoring</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Set your minimum acceptable salary instead of disclosing your
              current one. Offers are anchored to skills and market value — not a
              discounted past pay.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-medium">3. Consent-first reveal</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              You stay pseudonymized until you opt in. When a recruiter wants to
              know who you are, they ask — and only with your consent.
            </p>
          </div>
        </section>

        {/* The problem */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold">Why Binding exists</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-6">
              <h4 className="font-medium">The HK payslip culture</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Recruiters routinely demand current salary and payslips,
                anchoring every new offer to the old one. Women earn a median of
                HK$16,200/month vs HK$22,700 for men — a 28.6% gap that salary
                anchoring perpetuates.
              </p>
            </div>
            <div className="rounded-xl border p-6">
              <h4 className="font-medium">Job-seeking is exposed</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Looking on public platforms invites employer retaliation, profile
                harvesting, and ghost jobs. A professional should be able to
                explore opportunities with zero disclosure until they choose
                otherwise.
              </p>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="py-16 text-center">
          <h2 className="text-2xl font-semibold">Ready to see it work?</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            A working prototype is deployed and running real AI inference.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Button size="lg" render={<Link href="/signup?intent=seeker" />}>
              Try Binding
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/login" />}>
              Sign in
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Binding · Privacy-first hiring for Hong Kong · binding.hk
      </footer>
    </div>
  );
}
