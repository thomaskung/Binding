import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";

interface Props {
  jobs: { id: string; title: string; status: "draft" | "active" | "closed" }[];
}

/**
 * Job postings dashboard widget (DESIGN.md §13f): a compact count + most
 * recent posting, linking through to the full list. Built entirely from the
 * `jobs` array the Pipeline command-center already fetches — zero new query.
 */
export function JobPostingsCard({ jobs }: Props) {
  const activeCount = jobs.filter((j) => j.status === "active").length;
  const mostRecent = jobs[0] ?? null;

  return (
    <Card className="jb-lift" data-testid="job-postings-card">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2.5">
          <CardTitle className="text-xl">Job postings</CardTitle>
          <Badge variant="outline">{activeCount} active</Badge>
        </div>
        <CardDescription>
          {jobs.length} posting{jobs.length === 1 ? "" : "s"} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="truncate text-sm text-muted-foreground">
          {mostRecent ? `Most recent: ${mostRecent.title}` : "No postings yet."}
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" render={<Link href="/recruiter/jobs" />}>
          View job postings →
        </Button>
      </CardFooter>
    </Card>
  );
}
