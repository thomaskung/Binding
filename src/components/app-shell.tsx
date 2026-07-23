"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Badge, Button, Separator, cn } from "@jumponboard/ui";
import type { SeekerTier } from "@/lib/matching";
import { RoleSwitcher } from "@/components/role-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { DevTierToggle } from "@/app/(app)/seeker/dev-tier-toggle";

type Role = "seeker" | "recruiter";

interface NavItem {
  label: string;
  href?: string;
  icon: keyof typeof ICONS;
  /** Matches this item as active when the current URL equals this instead of `href`. */
  match?: string;
}

const SEEKER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/seeker", icon: "home", match: "/seeker" },
  { label: "Job matches", href: "/seeker?view=matches", icon: "list", match: "/seeker?view=matches" },
  { label: "Profile", href: "/seeker/profile", icon: "user" },
  { label: "Training", href: "/training", icon: "book" },
  { label: "Benefits", href: "/benefits", icon: "gift" },
];

const RECRUITER_NAV: NavItem[] = [
  { label: "Pipeline", icon: "chart" }, // disabled placeholder — backlog
  { label: "Candidates", icon: "users" }, // disabled placeholder — backlog
  { label: "Job postings", href: "/recruiter", icon: "briefcase" },
  { label: "Market intelligence", href: "/recruiter/market-intelligence", icon: "chart" },
  { label: "Team training", icon: "book" }, // disabled placeholder — backlog
];

const ICONS = {
  home: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  list: "M4 6h16M4 12h16M4 18h10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  book: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm2 14h12",
  gift: "M4 10h16v9H4v-9Zm0 0V8a2 2 0 0 1 2-2h1m10 4V8a2 2 0 0 0-2-2h-1M9 6a2 2 0 1 1 3 2M15 6a2 2 0 1 0-3 2M12 8v11",
  chart: "M5 20V10m6 10V4m6 16v-7",
  users: "M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8a6 6 0 0 1 12 0M17 8a3 3 0 1 1 0 6m1 6a6 6 0 0 0-4.5-9.8",
  briefcase: "M4 8h16v11H4V8Zm4 0V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
} as const;

function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 flex-none", className)}
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

interface AppShellProps {
  isSeeker: boolean;
  isRecruiter: boolean;
  displayName: string;
  companyName: string | null;
  seekerTier: SeekerTier;
  points: number;
  children: React.ReactNode;
}

export function AppShell({
  isSeeker,
  isRecruiter,
  displayName,
  companyName,
  seekerTier,
  points,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [railOpen, setRailOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Role-ambiguous routes (/benefits, /training, /thread/*) fall back to the
  // same job_active_role cookie the RoleSwitcher writes and "/" already
  // reads server-side — mirrors that existing last-used-role-wins pattern.
  const cookieRole =
    typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )job_active_role=(seeker|recruiter)/)?.[1] as Role | undefined)
      : undefined;
  const role: Role =
    pathname?.startsWith("/recruiter")
      ? "recruiter"
      : pathname?.startsWith("/seeker")
        ? "seeker"
        : (cookieRole ?? (isSeeker ? "seeker" : "recruiter"));

  const navItems = role === "seeker" ? SEEKER_NAV : RECRUITER_NAV;
  const currentUrl = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={cn(
          "flex flex-none flex-col justify-between border-r border-border bg-muted/40 transition-[width] duration-150",
          railOpen ? "w-[230px]" : "w-16",
        )}
      >
        <div>
          <div className="flex h-16 items-center gap-2 px-4">
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="flex size-7 flex-none items-center justify-center rounded-md bg-foreground font-heading text-sm font-semibold text-background"
              aria-label={railOpen ? "Collapse navigation" : "Expand navigation"}
            >
              J
            </button>
            {railOpen && <span className="truncate text-sm font-semibold tracking-tight">JumpOnBoard</span>}
          </div>
          <Separator />
          <nav className="flex flex-col gap-0.5 p-2">
            {navItems.map((item) => {
              const active = !!item.href && (item.match ?? item.href) === currentUrl;
              if (!item.href) {
                return (
                  <span
                    key={item.label}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50"
                    title="Coming soon"
                  >
                    <Icon name={item.icon} />
                    {railOpen && (
                      <span className="flex flex-1 items-center justify-between gap-2 truncate">
                        {item.label}
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Soon
                        </Badge>
                      </span>
                    )}
                  </span>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                    active ? "bg-primary/10 font-medium text-primary" : "text-foreground",
                  )}
                >
                  <Icon name={item.icon} />
                  {railOpen && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="relative border-t border-border p-2">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
          >
            <span className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(displayName)}
            </span>
            {railOpen && (
              <span className="flex flex-col truncate">
                <span className="truncate text-sm font-medium">
                  {(role === "recruiter" ? companyName : null) || displayName || "Your account"}
                </span>
                <span className="truncate text-xs capitalize text-muted-foreground">{role} mode</span>
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-2 mb-1 w-56 space-y-1 rounded-md border border-border bg-popover p-2 shadow-md">
              <RoleSwitcher current={role} isSeeker={isSeeker} isRecruiter={isRecruiter} />
              {role === "recruiter" && (
                <Button variant="ghost" size="sm" className="w-full justify-start" render={<Link href="/recruiter/profile" />}>
                  Company profile
                </Button>
              )}
              {role === "seeker" && (
                <div className="px-1">
                  <DevTierToggle tier={seekerTier} />
                </div>
              )}
              <Separator />
              <SignOutButton />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 flex-none items-center justify-end border-b border-border px-6">
          <Badge variant="secondary" data-testid="points-balance">
            {points} pts
          </Badge>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
