import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DeleteConfirm } from "./delete-confirm";

export default async function AccountPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Signed in as {session.displayName}
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Privacy & security</h2>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <DeleteConfirm />
      </section>
    </div>
  );
}
