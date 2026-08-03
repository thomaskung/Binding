"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@binding/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      data-testid="sign-out"
      onClick={() =>
        startTransition(async () => {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        })
      }
    >
      Sign out
    </Button>
  );
}
