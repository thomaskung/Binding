"use client";

import { useState } from "react";
import { deleteAccount } from "./actions";

const CONFIRM_TEXT = "DELETE";

export function DeleteConfirm() {
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("confirm")}
        className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <p className="text-sm font-medium">Are you absolutely sure?</p>
      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
        <li>Your profile, resume, and skill vectors will be permanently deleted</li>
        <li>Your job postings will be closed</li>
        <li>Your points balance will be forfeited</li>
        <li>Messages from other users will be anonymized but retained</li>
      </ul>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          Type <span className="font-mono font-bold">{CONFIRM_TEXT}</span> to confirm
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_TEXT}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setStep("busy");
            setError(null);
            try {
              await deleteAccount();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
              setStep("confirm");
            }
          }}
          disabled={typed !== CONFIRM_TEXT || step === "busy"}
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {step === "busy" ? "Deleting..." : "Permanently delete"}
        </button>
        <button
          onClick={() => {
            setStep("idle");
            setTyped("");
            setError(null);
          }}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
