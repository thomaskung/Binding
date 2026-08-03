import Link from "next/link";

/** Auth-screen chrome per the LoginFlow template: muted backdrop, centered
 * logo mark above the card, terms line below — no top nav bar. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-5 py-8">
      <div className="flex w-full max-w-[400px] flex-col gap-5">
        <Link href="/" className="flex items-center justify-center gap-2">
          <span className="inline-block size-[22px] rounded-md bg-primary" />
          <span className="text-[15px] font-semibold tracking-tight">Binding</span>
        </Link>
        {children}
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our Terms and Privacy Policy{" "}
          <span className="text-muted-foreground/70">(draft — pending legal review)</span>.
        </p>
      </div>
    </div>
  );
}
