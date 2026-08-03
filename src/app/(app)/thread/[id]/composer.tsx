"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@binding/ui";
import { sendMessage } from "@/app/(app)/recruiter/actions";

export function MessageComposer({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2 pt-4"
      action={() =>
        startTransition(async () => {
          await sendMessage(threadId, body);
          setBody("");
        })
      }
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
