import Link from "next/link";
import { Button } from "@jumponboard/ui";
import { SignOutButton } from "@/components/sign-out-button";

/** Minimal shared header for landing/auth/onboarding pages. Wordmark always
 * links home; the right side is contextual. */
export function AuthNav({
  context,
}: {
  context: "landing" | "signup" | "login" | "authenticated";
}) {
  return (
    <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
      <Link href="/" className="text-lg font-bold tracking-tight">
        JumpOnBoard
      </Link>
      {context === "authenticated" ? (
        <SignOutButton />
      ) : context === "login" ? (
        <Button variant="ghost" size="sm" data-testid="nav-signup" render={<Link href="/signup" />}>
          New here? Sign up →
        </Button>
      ) : (
        <Button variant="ghost" size="sm" data-testid="nav-signin" render={<Link href="/login" />}>
          Sign in →
        </Button>
      )}
    </nav>
  );
}
