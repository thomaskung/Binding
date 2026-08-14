import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";

interface Props {
  balance: number;
}

/**
 * Reveal-credits dashboard widget (DESIGN.md §13f): current points balance,
 * framed for what it's spent on here — candidate reveals. Reads through the
 * same `getBalance` helper the header "{n} points" chip and /recruiter/points
 * equivalents use (src/lib/points.ts) — no new balance concept.
 */
export function RevealCreditsCard({ balance }: Props) {
  return (
    <Card className="jb-lift" data-testid="reveal-credits-card">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2.5">
          <CardTitle className="text-xl">Reveal credits</CardTitle>
          <Badge variant="outline">{balance} pts</Badge>
        </div>
        <CardDescription>Points available to reveal candidate identities</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Standard reveals are opt-in-gated; overrides disclose immediately at a premium. Cost scales
          with match quality and drops 40% on repeat reveals for the same posting.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" render={<Link href="/recruiter/candidates" />}>
          Review candidates →
        </Button>
      </CardFooter>
    </Card>
  );
}
