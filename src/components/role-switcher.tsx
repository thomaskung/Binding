"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Dual-role navigation: switch link when the user holds both roles, opt-in
 * CTA for the missing role otherwise. Sets a lightweight cookie so `/`
 * remembers the last-used context. */
export function RoleSwitcher({
  current,
  isSeeker,
  isRecruiter,
}: {
  current: "seeker" | "recruiter";
  isSeeker: boolean;
  isRecruiter: boolean;
}) {
  const other = current === "seeker" ? "recruiter" : "seeker";
  const hasOther = other === "seeker" ? isSeeker : isRecruiter;
  const href = hasOther ? `/${other}` : `/onboarding/${other}`;
  const label = hasOther
    ? other === "recruiter"
      ? "Switch to hiring"
      : "Switch to job seeking"
    : other === "recruiter"
      ? "Start hiring"
      : "Start job seeking";

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="role-switcher"
      render={<Link href={href} />}
      onClick={() => {
        document.cookie = `job_active_role=${hasOther ? other : current}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {label}
    </Button>
  );
}
