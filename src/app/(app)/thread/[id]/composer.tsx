"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@binding/ui";
import { sendMessage } from "@/app/(app)/recruiter/actions";

export function MessageComposer({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex gap-2 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await sendMessage(threadId, body);
          router.refresh();
          setBody("");
        });
      }}
    >
      <Input
        value={body}
        data-testid="message-input"
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
      />
      <Button type="submit" disabled={pending || !body.trim()} data-testid="message-send">
        Send
      </Button>
    </form>
  );
}
