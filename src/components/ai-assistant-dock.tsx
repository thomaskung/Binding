"use client";

import { useState, useTransition } from "react";
import { Button, cn } from "@binding/ui";
import { askCareerAssistant } from "@/app/(app)/ai-assistant-actions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** Floating career-assistant chat dock. This is a simple, unmetered lookalike
 * shipped now — NOT BUSINESS.md's Pillar 5 metered/classifier-gated AI
 * allowance, which is still on the roadmap pending post-launch usage-cost
 * data. No usage cap, no tier check, free for every signed-in user. */
export function AiAssistantDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    setError(null);
    const userMessage: Message = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    startTransition(async () => {
      try {
        const response = await askCareerAssistant(trimmed, messages);
        const assistantMessage: Message = { role: "assistant", content: response };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to get response");
        // Remove the user message since the request failed
        setMessages((prev) => prev.slice(0, -1));
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-7 right-7 flex size-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 z-40"
        title="Ask AI"
        aria-label="Ask AI career assistant"
      >
        <span className="text-[20px]">✨</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-7 w-[360px] max-h-[500px] flex flex-col rounded-2xl border border-border bg-background shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Career Assistant</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground text-[20px] leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
            {messages.length === 0 ? (
              <p className="text-[13px] text-muted-foreground italic">
                Ask about resume writing, cover letters, interview prep, or career guidance.
              </p>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg px-3 py-2 text-[13px] leading-relaxed max-w-[90%] word-wrap",
                    msg.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {msg.content}
                </div>
              ))
            )}
            {error && (
              <div className="rounded-lg px-3 py-2 text-[13px] bg-destructive/10 text-destructive">
                {error}
              </div>
            )}
            {pending && (
              <div className="rounded-lg px-3 py-2 text-[13px] bg-muted text-muted-foreground italic">
                Thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your question..."
                disabled={pending}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={pending || !input.trim()}
                className="h-9 px-3"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
