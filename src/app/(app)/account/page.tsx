import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@binding/ui";
import { DeleteConfirm } from "./delete-confirm";

export default async function AccountPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  return (
    <div className="jb-fade mx-auto max-w-2xl space-y-6 px-5 py-8">
      <header>
        <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {session.displayName}
        </p>
      </header>

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle>Privacy &amp; security</CardTitle>
          <CardDescription>Coming soon.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="jb-lift ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Once you delete your account, there is no going back. Please be certain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteConfirm />
        </CardContent>
      </Card>
    </div>
  );
}
