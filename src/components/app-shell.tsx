"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Badge, Tabs, TabsList, TabsTrigger, cn } from "@binding/ui";
import type { SeekerTier } from "@/lib/matching";
import { SignOutButton } from "@/components/sign-out-button";
import { DevTierToggle } from "@/app/(app)/seeker/dev-tier-toggle";

type Role = "seeker" | "recruiter";

interface NavItem {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  /** Dashboard-style items activate on exact match only; others on prefix. */
  exact?: boolean;
}

// Nav lists per the NavShell mockup template — all items live, no
// placeholders. Recruiter Dashboard points at /recruiter (interim redirect to
// the job list until the pipeline overview lands).
const SEEKER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/seeker", icon: "home", exact: true },
  { label: "Profile", href: "/seeker/profile", icon: "doc" },
  { label: "Job", href: "/seeker/matches", icon: "briefcase" },
  { label: "Training", href: "/training", icon: "cap" },
  { label: "Benefit", href: "/benefits", icon: "gift" },
];

const RECRUITER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/recruiter", icon: "home", exact: true },
  { label: "Profile", href: "/recruiter/profile", icon: "doc" },
  { label: "Job postings", href: "/recruiter/jobs", icon: "briefcase" },
  { label: "Market intel", href: "/recruiter/market-intelligence", icon: "chart" },
  { label: "Training", href: "/training", icon: "cap" },
];

// Icon paths lifted from the NavShell mockup template.
const ICONS = {
  home: "M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z",
  doc: "M6 2h9l5 5v14a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z M14 2v6h6 M8 13h8 M8 17h8",
  briefcase: "M4 8h16v10a1 1 0 01-1 1H5a1 1 0 01-1-1zM9 8V6a2 2 0 012-2h2a2 2 0 012 2v2",
  cap: "M12 4l9 4-9 4-9-4zM6 10.5v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5",
  gift: "M4 10h16v10H4zM12 10v10M4 10V7a2 2 0 012-2h2a2 2 0 012 2v3M12 10V7a2 2 0 012-2h2a2 2 0 012 2v3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  hamburger: "M4 6h16M4 12h16M4 18h16",
  sparkle: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
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
      className={cn("size-5 flex-none", className)}
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

// Alerts strip static fallback (decision #9): a per-role product line until a
// real announcements source exists. No schema behind it on purpose.
const ANNOUNCEMENT: Record<Role, string> = {
  seeker: "Privacy-first matching — recruiters never see your identity until you approve a reveal.",
  recruiter: "Matched candidates are pseudonymized until they accept your reveal.",
};

const MOBILE_BREAKPOINT_PX = 768;

interface AppShellProps {
  isSeeker: boolean;
  isRecruiter: boolean;
  displayName: string;
  companyName: string | null;
  seekerTier: SeekerTier;
  points: number;
  /** job_active_role cookie, read server-side (see (app)/layout.tsx) — must
   * NOT be read from document.cookie in this client component: doing so
   * diverges from the server-rendered HTML whenever it disagrees with the
   * isSeeker/isRecruiter-based fallback below, causing a hydration mismatch. */
  cookieRole: Role | null;
  /** rail_open cookie, read server-side — same SSR-safety reasoning as
   * cookieRole. Mockup default is collapsed (startCollapsed=true); the
   * cookie, when present, wins. */
  initialRailOpen: boolean;
  aiSuggestionSeeker: string | null;
  aiSuggestionRecruiter: string | null;
  children: React.ReactNode;
}

export function AppShell({
  isSeeker,
  isRecruiter,
  displayName,
  companyName,
  seekerTier,
  points,
  cookieRole,
  initialRailOpen,
  aiSuggestionSeeker,
  aiSuggestionRecruiter,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [railOpen, setRailOpen] = useState(initialRailOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Mobile: collapse to icon-only once, on mount, below the breakpoint — no
  // ongoing resize listener re-fighting a manual toggle afterward. Runs
  // post-mount only, so it's a plain state update, not a hydration mismatch.
  // Viewport width is unreadable at SSR/render time, so a one-time read in an
  // effect is the deliberate exception to "no setState in effects" here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) setRailOpen(false);
  }, []);

  function toggleRail() {
    setRailOpen((v) => {
      const next = !v;
      document.cookie = `rail_open=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // Role-ambiguous routes (/benefits, /training, /thread/*) fall back to the
  // job_active_role cookie — last-used-role-wins, but only when the account
  // actually holds that role (a stale cookie must never grant nav access).
  const role: Role =
    pathname?.startsWith("/recruiter")
      ? "recruiter"
      : pathname?.startsWith("/seeker")
        ? "seeker"
        : (cookieRole === "recruiter" && isRecruiter) || (isRecruiter && !isSeeker)
          ? "recruiter"
          : "seeker";

  // Mode switch via the vertical tabs (mockup): switching to a role the
  // account holds goes to that role's home; a missing role goes to its
  // opt-in. Same cookie the old RoleSwitcher wrote.
  function switchMode(next: string) {
    if (next !== "seeker" && next !== "recruiter") return;
    if (next === role) return;
    const hasIt = next === "seeker" ? isSeeker : isRecruiter;
    document.cookie = `job_active_role=${hasIt ? next : role}; path=/; max-age=31536000; samesite=lax`;
    router.push(hasIt ? `/${next}` : `/onboarding/${next}`);
  }

  const navItems = role === "seeker" ? SEEKER_NAV : RECRUITER_NAV;
  const aiSuggestion = role === "seeker" ? aiSuggestionSeeker : aiSuggestionRecruiter;
  const modeLabel = role === "seeker" ? "Seeker" : "Recruiter";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "flex flex-none flex-col justify-between border-r border-border bg-background px-2.5 py-3.5 transition-[width] duration-150",
          railOpen ? "w-[236px]" : "w-16",
        )}
      >
        <div>
          <button
            type="button"
            onClick={toggleRail}
            className="mb-5 flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
            aria-label={railOpen ? "Collapse navigation" : "Expand navigation"}
          >
            <Icon name="hamburger" />
            {railOpen && (
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight">
                Binding
              </span>
            )}
          </button>
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname?.startsWith(item.href) ?? false;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors hover:bg-muted",
                    active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon name={item.icon} />
                  {railOpen && <span className="truncate whitespace-nowrap">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border pt-2.5">
          <button
            type="button"
            data-testid="account-menu-toggle"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left hover:bg-muted"
          >
            <span className="flex size-[30px] flex-none items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
              {initials(displayName)}
            </span>
            {railOpen && (
              <span className="flex flex-col overflow-hidden">
                <span className="truncate whitespace-nowrap text-[13px] font-semibold">
                  {(role === "recruiter" ? companyName : null) || displayName || "Your account"}
                </span>
                <span className="truncate whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {modeLabel} · Settings
                </span>
              </span>
            )}
          </button>

          {profileOpen && (
            <div className="mt-1.5 flex flex-col gap-1.5 rounded-[10px] bg-muted p-2">
              <span className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Switch mode
              </span>
              <Tabs orientation="vertical" value={role} onValueChange={switchMode}>
                <TabsList className="w-full">
                  <TabsTrigger value="seeker" className="w-full justify-start">
                    Seeker
                  </TabsTrigger>
                  <TabsTrigger value="recruiter" className="w-full justify-start">
                    Recruiter
                  </TabsTrigger>
                  <TabsTrigger
                    value="enterprise"
                    disabled
                    data-testid="nav-enterprise-tab"
                    className="w-full justify-start"
                  >
                    Enterprise
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {role === "seeker" && (
                <div className="px-1">
                  <DevTierToggle tier={seekerTier} />
                </div>
              )}
              <SignOutButton />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] flex-none items-center justify-between gap-4 border-b border-border bg-background px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Badge variant="secondary">Update</Badge>
            <span className="truncate text-[13px] text-muted-foreground">
              {ANNOUNCEMENT[role]}
            </span>
          </div>
          <div className="flex flex-none items-center gap-2">
            {aiSuggestion && (
              <span
                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
                data-testid="ai-suggestion-chip"
              >
                <Icon name="sparkle" className="size-[15px]" />
                {aiSuggestion}
              </span>
            )}
            {role === "seeker" ? (
              <Link
                href="/seeker/points"
                className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-accent"
                data-testid="points-balance"
              >
                {points.toLocaleString()} points
              </Link>
            ) : (
              <span
                className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
                data-testid="points-balance"
              >
                {points.toLocaleString()} points
              </span>
            )}
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <main ref={mainRef} className="h-full overflow-y-auto">
            {children}
          </main>
          <button
            type="button"
            title="Back to top"
            onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            className="absolute bottom-6 right-7 flex size-[42px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Icon name="arrowUp" className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
