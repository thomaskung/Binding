import Link from "next/link";
import { Badge, Card, CardContent } from "@binding/ui";

/** Small, visually-distinct entry point to the 3 Track B enterprise mock
 * surfaces (Binding.dc.html "RECRUITER · CANDIDATES" Pipeline tab, "TEAM
 * TRAINING", "COMPENSATION ADVISORY") — dashed border + outline badge
 * deliberately unlike the real "Your tools" cards above, so this never
 * reads as a shipped feature. NOT a live feature: no backend, no tests. */
export function EnterprisePreviewTeaserCard() {
  return (
    <Card className="border-dashed" data-testid="enterprise-preview-teaser-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div>
          <Badge
            variant="outline"
            className="mb-1.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: "var(--primary)", background: "var(--accent)" }}
          >
            Enterprise · Preview
          </Badge>
          <p className="text-[13px] text-muted-foreground">
            A look at what&apos;s on the roadmap — not live features yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium">
          <Link href="/recruiter/candidates" className="text-primary underline-offset-2 hover:underline">
            Pipeline board
          </Link>
          <Link
            href="/recruiter/enterprise/training"
            className="text-primary underline-offset-2 hover:underline"
          >
            Team training
          </Link>
          <Link
            href="/recruiter/enterprise/compensation"
            className="text-primary underline-offset-2 hover:underline"
          >
            Compensation advisory
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
