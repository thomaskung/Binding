import Link from "next/link";

/** Auth-screen chrome per the LoginFlow template: split panel on larger
 * screens (form left, dark brand aside right with a candidate quote),
 * single centered column on mobile (aside hidden — jb-fade on mount).
 * Logo mark + terms line are legal/nav chrome that survive the redesign. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="jb-fade grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="flex items-center justify-center bg-background px-5 py-8">
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
      <div className="hidden flex-col justify-between bg-foreground p-12 text-background lg:flex">
        <span className="text-[13px] font-semibold opacity-60">The privacy-first hiring network</span>
        <div>
          <p className="font-heading text-[34px] font-medium leading-[1.15] tracking-tight">
            &ldquo;I got matched to three roles before anyone knew my name — or my current
            salary.&rdquo;
          </p>
          <p className="mt-5 text-[13.5px] opacity-70">Backend engineer · matched in Singapore</p>
        </div>
        <div className="flex gap-6 text-[12.5px] opacity-55">
          <span>Consent-gated</span>
          <span>PDPA / PDPO</span>
          <span>No cold outbound</span>
        </div>
      </div>
    </div>
  );
}
