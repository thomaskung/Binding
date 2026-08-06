"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@binding/ui";
import { saveRecruiterProfile } from "@/app/(app)/recruiter/actions";
import { OnboardingChrome } from "../../seeker/onboarding-chrome";

const COMPANY_SIZE_LABEL: Record<string, string> = {
  startup: "1–50 employees",
  mid: "51–500 employees",
  large: "501–5,000 employees",
  enterprise: "5,000+ employees",
};

interface Props {
  displayName: string;
  companyName: string;
  recruiterTitle: string;
  companyIndustry: string;
  companySize: string | null;
  phone: string;
}

/** Steps 2-3 of the recruiter onboarding wizard (mirrors the seeker wizard's
 * client/step pattern, onboarding-wizard.tsx): company details, then a
 * first-job-post hand-off. Reuses saveRecruiterProfile unchanged — pass
 * display_name/company_name through untouched so step 1's values survive
 * (saveRecruiterProfile overwrites both on every call). */
export function RecruiterOnboardingWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"company" | "job">("company");
  const [recruiterTitle, setRecruiterTitle] = useState(props.recruiterTitle);
  const [companyIndustry, setCompanyIndustry] = useState(props.companyIndustry);
  const [companySize, setCompanySize] = useState(props.companySize ?? "");
  const [phone, setPhone] = useState(props.phone);
  const [pending, startTransition] = useTransition();

  function continueToJobStep() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("display_name", props.displayName);
      fd.set("company_name", props.companyName);
      fd.set("recruiter_title", recruiterTitle);
      fd.set("company_industry", companyIndustry);
      fd.set("company_size", companySize);
      fd.set("phone", phone);
      await saveRecruiterProfile(fd);
      setStep("job");
    });
  }

  if (step === "job") {
    return (
      <OnboardingChrome
        current={3}
        skipHref="/recruiter"
        skipTestId="recruiter-wizard-skip"
        title="You're set"
        description="Post your first role, or come back to it later."
      >
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">
              Your company profile is saved. Posting a role starts matching against opted-in
              candidates right away.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setStep("company")}>
                Back
              </Button>
              <Button
                className="flex-1"
                data-testid="recruiter-onboarding-post-job"
                render={<Link href="/recruiter/jobs/new" />}
              >
                Post your first job
              </Button>
            </div>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                data-testid="recruiter-onboarding-finish-skip"
                render={<Link href="/recruiter" />}
              >
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      </OnboardingChrome>
    );
  }

  return (
    <OnboardingChrome
      current={2}
      skipHref="/recruiter"
      skipTestId="recruiter-wizard-skip"
      title="Company details"
      description="Helps candidates size up the role before they express interest."
    >
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="recruiter_title">Your title</Label>
            <Input
              id="recruiter_title"
              data-testid="recruiter-onboarding-title"
              value={recruiterTitle}
              onChange={(e) => setRecruiterTitle(e.target.value)}
              placeholder="Talent Acquisition Lead"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_industry">Company industry</Label>
            <Input
              id="company_industry"
              data-testid="recruiter-onboarding-industry"
              value={companyIndustry}
              onChange={(e) => setCompanyIndustry(e.target.value)}
              placeholder="e.g. Fintech"
            />
          </div>
          <div className="space-y-2">
            <Label>Company size</Label>
            <Select value={companySize} onValueChange={(v) => setCompanySize(v ?? "")}>
              <SelectTrigger data-testid="recruiter-onboarding-size" style={{ width: "100%" }}>
                <SelectValue>{companySize ? COMPANY_SIZE_LABEL[companySize] : "Select…"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="startup">1–50</SelectItem>
                <SelectItem value="mid">51–500</SelectItem>
                <SelectItem value="large">501–5,000</SelectItem>
                <SelectItem value="enterprise">5,000+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              data-testid="recruiter-onboarding-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Never shown to candidates"
            />
          </div>
          <div className="flex justify-end">
            <Button
              data-testid="recruiter-onboarding-continue"
              disabled={pending}
              onClick={continueToJobStep}
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingChrome>
  );
}
