import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSessionProfile } from "@/lib/auth";
import { chooseRole } from "./actions";

export default async function OnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role) redirect(session.role === "seeker" ? "/seeker" : "/recruiter");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to JumpOnBoard</CardTitle>
          <CardDescription>How will you use the platform?</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={chooseRole} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input id="display_name" name="display_name" placeholder="Your name" />
              <p className="text-xs text-muted-foreground">
                Seekers stay pseudonymous — your name is only disclosed after a
                reveal you consent to.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button type="submit" name="role" value="seeker" variant="outline" className="h-24 flex-col">
                <span className="text-lg font-semibold">Job seeker</span>
                <span className="text-xs text-muted-foreground">Enter the talent pool</span>
              </Button>
              <Button type="submit" name="role" value="recruiter" variant="outline" className="h-24 flex-col">
                <span className="text-lg font-semibold">Recruiter</span>
                <span className="text-xs text-muted-foreground">Find matched talent</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
