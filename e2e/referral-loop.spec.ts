import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, requireFixture, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Referral / invite acquisition loop (DESIGN.md §13g, src/lib/referrals.ts,
 * src/lib/points.ts earnReferralActivation, src/app/(app)/invite/page.tsx).
 *
 * Drives the real UI end to end rather than asserting on the pure functions
 * alone (those are covered by tests/referrals.test.ts and
 * tests/referral-activation.test.ts): account A (referrer) gets its invite
 * link from /invite, a brand-new account B visits `/invite/<code>`
 * unauthenticated (the redeem-landing route handler — sets the httpOnly
 * `referral_code` cookie, redirects to /signup with no query param per the
 * founder's path-segment-only routing rule), then B signs in (the e2e
 * password-login shortcut — see staging-helpers.ts signIn) and completes
 * onboarding, which is the "activation" moment that pays both parties.
 *
 * Two SEPARATE `stagingContext(browser)` contexts (A and B) — signing in as
 * B inside A's context would clobber A's session.
 *
 * Modal AI cost: ZERO. Both accounts use the free `wizard-skip` onboarding
 * path (no resume text passed to completeSeekerOnboarding), so this spec
 * makes no `countAiCall()` calls and doesn't move the suite's AI-call
 * budget.
 *
 * Single test, no module-level `let` shared across tests — sidesteps the
 * worker-restart/requireFixture trap (CLAUDE.md Gotchas) entirely rather
 * than guarding against it. (requireFixture is still imported and used on
 * the invite-code extraction below, since a blank code would otherwise hang
 * a 404 navigation for tens of seconds before failing with a confusing
 * error.)
 *
 * NOTE (report this to the founder, per the build brief): supabase/migrations/
 * 0029_referrals.sql is a new migration in this same PR and has NOT been
 * applied to hosted staging — this spec's `referrals`/`profiles.invite_code`
 * reads/writes will fail against real staging until `pnpm db:push` (or a
 * merge) applies it. Per CLAUDE.md's existing migration-gate logic, the PR
 * gate already skips e2e entirely for migration-touching PRs, so this spec's
 * first real run is the next nightly after the migration lands — same
 * posture as the 0023/0025 gotcha entries.
 */

test("referrer's invite link pays both parties when the invitee activates", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = stagingAdminClient();

  // --- Account A: the referrer ---
  const ctxA = await stagingContext(browser);
  const pageA = await ctxA.newPage();
  const userA = await ensureStagingUser("seeker");
  await signIn(pageA, userA.email);
  await completeSeekerOnboarding(pageA, { name: uniqueLabel("Ray Referrer") });

  await pageA.goto("/invite");
  const inviteLinkInput = pageA.getByTestId("invite-link");
  await expect(inviteLinkInput).toBeVisible({ timeout: 20_000 });
  const inviteLink = requireFixture(await inviteLinkInput.inputValue(), "inviteLink");
  const code = requireFixture(new URL(inviteLink).pathname.split("/").pop(), "invite code");

  // Baseline: no referrals yet for a brand-new invite code.
  await expect(pageA.getByTestId("invite-activated-count")).toContainText("0 activated");

  // --- Account B: the invitee, redeeming A's link ---
  const ctxB = await stagingContext(browser);
  const pageB = await ctxB.newPage();
  const userB = await ensureStagingUser("seeker");

  // Unauthenticated visit — the redeem-landing route handler resolves the
  // code, sets the `referral_code` cookie, and 302s to /signup (no ?ref=
  // query param). The cookie persists in this context through the
  // subsequent /login navigation below.
  await pageB.goto(`/invite/${code}`, { timeout: 30_000 });
  await pageB.waitForURL(/\/signup$/, { timeout: 15_000 });

  await signIn(pageB, userB.email);
  await completeSeekerOnboarding(pageB, { name: uniqueLabel("Ivy Invitee") });

  // --- Assert both halves: the ledger (most robust) and the referrer's UI ---
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("referrals")
          .select("status")
          .eq("referrer_id", userA.id)
          .eq("referee_id", userB.id)
          .maybeSingle();
        return data?.status ?? null;
      },
      { timeout: 30_000, message: "referral row never reached 'activated'" },
    )
    .toBe("activated");

  const { data: ledgerRows } = await admin
    .from("points_ledger")
    .select("profile_id, amount, note")
    .in("profile_id", [userA.id, userB.id])
    .like("note", "referral activation%");
  expect(ledgerRows ?? []).toHaveLength(2);
  const byProfile = new Map((ledgerRows ?? []).map((r) => [r.profile_id, r]));
  expect(byProfile.get(userA.id)?.amount).toBeGreaterThan(0);
  expect(byProfile.get(userB.id)?.amount).toBeGreaterThan(0);
  expect(byProfile.get(userA.id)?.note).toContain("referrer");
  expect(byProfile.get(userB.id)?.note).toContain("referee");

  await pageA.reload();
  await expect(pageA.getByTestId("invite-activated-count")).toContainText("1 activated", {
    timeout: 20_000,
  });
  await expect(pageA.getByTestId("invite-row").first().getByTestId("invite-status")).toHaveText(
    "Activated",
  );

  await ctxA.close();
  await ctxB.close();
});
