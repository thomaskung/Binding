"use client";

import { useRouter } from "next/navigation";
import { RoleChooserCards } from "@/components/role-chooser-cards";

export function OnboardingChooser() {
  const router = useRouter();
  return <RoleChooserCards onPick={(role) => router.push(`/onboarding/${role}`)} />;
}
