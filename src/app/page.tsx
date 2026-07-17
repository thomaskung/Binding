import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSessionProfile } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getSessionProfile();
  if (session?.role === "seeker") redirect("/seeker");
  if (session?.role === "recruiter") redirect("/recruiter");
  if (session && !session.role) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">JumpOnBoard</h1>
      <p className="text-lg text-muted-foreground">
        Privacy-first hiring for APAC. Match on skills and compensation fit —
        before anyone sees your name.
      </p>
      <Button size="lg" render={<Link href="/login" />}>
        Get started
      </Button>
    </main>
  );
}
