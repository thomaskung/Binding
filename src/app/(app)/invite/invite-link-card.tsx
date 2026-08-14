"use client";

import { useState } from "react";
import { Button, Input } from "@binding/ui";

/** Client half of the invite link: the `link` prop arrives already-absolute
 * from the server component (built from request headers — see
 * src/app/(app)/invite/page.tsx), so this component only owns the
 * copy-to-clipboard button. Deliberately NOT computed client-side from
 * `window.location.origin` here: a client-only recompute would render a
 * relative `/invite/<code>` on the server pass and an absolute URL after
 * hydration — a hydration mismatch, and one that would also make an e2e
 * spec's `new URL(inputValue())` intermittently throw if it read the value
 * before hydration finished. One SSR-stable value sidesteps both. */
export function InviteLinkCard({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silent no-op,
      // the link is still selectable by hand from the readonly input.
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={link}
        data-testid="invite-link"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button onClick={copy} variant="outline" data-testid="invite-copy">
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
