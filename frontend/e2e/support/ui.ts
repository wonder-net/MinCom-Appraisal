import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Drives the real login form — used by every spec, this IS the login critical path. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("login");
  await page.locator("#identifier").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/appraisals/, { timeout: 15_000 });
}

export async function goToAppraisal(page: Page, appraisalId: string): Promise<void> {
  await page.goto(`appraisals/${appraisalId}`);
  await expect(page.getByRole("tablist", { name: "Appraisal sections" })).toBeVisible();
}
