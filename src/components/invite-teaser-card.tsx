import Link from "next/link";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@binding/ui";

/** Small entry point to /invite (DESIGN.md §13g). The referral/acquisition
 * loop isn't one of the fixed SEEKER_NAV/RECRUITER_NAV destinations
 * (CLAUDE.md deliberately keeps those lists closed), so a dashboard card is
 * the surfacing mechanism instead of a new permanent nav item. Identical on
 * both seeker and recruiter dashboards — the mechanic itself is
 * role-agnostic (src/app/(app)/invite/page.tsx). */
export function InviteTeaserCard() {
  return (
    <Card className="jb-lift" data-testid="invite-teaser-card">
      <CardHeader>
        <CardTitle>Invite friends</CardTitle>
        <CardDescription>Earn points together when they activate an account</CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" render={<Link href="/invite" />}>
          Get your invite link
        </Button>
      </CardContent>
    </Card>
  );
}
