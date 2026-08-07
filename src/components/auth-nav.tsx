import Link from "next/link";
import { Button } from "@binding/ui";
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
      {context === "landing" ? (
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-foreground text-background font-semibold"
            aria-label="Binding"
          >
            B
          </Link>
          <Link href="/" className="font-semibold tracking-tight">
            Binding
          </Link>
          <div className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">
            HK · SG
          </div>
        </div>
      ) : (
        <Link href="/" className="text-lg font-bold tracking-tight">
          Binding
        </Link>
      )}
      {context === "authenticated" ? (
        <SignOutButton />
      ) : context === "login" ? (
        <Button variant="ghost" size="sm" data-testid="nav-signup" render={<Link href="/signup" />}>
          New here? Sign up →
        </Button>
      ) : context === "landing" ? (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" data-testid="nav-signin" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" data-testid="nav-get-started" render={<Link href="/signup" />}>
            Get started
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" data-testid="nav-signin" render={<Link href="/login" />}>
          Sign in →
        </Button>
      )}
    </nav>
  );
}
