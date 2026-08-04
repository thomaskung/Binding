import { type Page } from "@playwright/test";

/** The recruiter match list defaults its min-match filter to 70%; drag it to
 * the floor (55%) so seeded/stub matches of any score stay visible. Shared by
 * the smoke + override specs (kept in a non-spec file so importing it doesn't
 * re-register another file's tests). */
export async function widenMatchFilter(page: Page) {
  const slider = page.getByTestId("filter-min-pct").getByRole("slider");
  if (await slider.count()) await slider.press("Home");
}
