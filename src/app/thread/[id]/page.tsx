import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MessageComposer } from "./composer";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();

  // RLS restricts thread + messages to reveal participants.
  const { data: thread } = await supabase
    .from("message_threads")
    .select(
      "id, reveal_requests(id, fit_summary, profile_id, recruiter_id, job_postings(title))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!thread) notFound();

  const reveal = Array.isArray(thread.reveal_requests)
    ? thread.reveal_requests[0]
    : thread.reveal_requests;
  const job = reveal
    ? (Array.isArray(reveal.job_postings) ? reveal.job_postings[0] : reveal.job_postings)
    : null;

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  const backHref = session.role === "seeker" ? "/seeker" : "/recruiter";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Conversation — {job?.title ?? "role"}</h1>
          <p className="text-sm text-muted-foreground">
            Contact details stay off-thread unless the candidate shares them.
            Keep the conversation here — that&apos;s the deal.
          </p>
        </div>
        <Button variant="ghost" render={<Link href={backHref} />}>
          ← Back
        </Button>
      </header>

      {reveal?.fit_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI fit summary</CardTitle>
            <CardDescription>{reveal.fit_summary}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 py-6">
          {(messages ?? []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No messages yet — say hello.
            </p>
          ) : (
            (messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender_id === session.userId ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.sender_id === session.userId
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  data-testid="message-bubble"
                >
                  {m.body}
                </div>
              </div>
            ))
          )}
          <MessageComposer threadId={id} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-2">
          Post-MVP
        </Badge>
        Interview scheduling lands here next.
      </p>
    </main>
  );
}
