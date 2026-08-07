import { test, expect } from "@playwright/test";
import { EMPLOYEE_SELF_ASSESSMENT } from "./support/constants";

/**
 * Critical path 1/5: login. The single most-broken flow this session —
 * both /portal/login and /admin's post-login redirect silently served
 * the wrong content because of Apache routing gaps invisible to any
 * unit/API test. This proves the real login page renders (not the SPA
 * catch-all shell / a blank page) and a real credential round-trip
 * actually lands the user in the app.
 */
test.describe("Login", () => {
  test("renders the real login form, not a blank/fallback page", async ({ page }) => {
    await page.goto("login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("#identifier")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("valid credentials redirect into the app", async ({ page }) => {
    await page.goto("login");
    await page.locator("#identifier").fill(EMPLOYEE_SELF_ASSESSMENT.email);
    await page.locator("#password").fill(EMPLOYEE_SELF_ASSESSMENT.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/appraisals/, { timeout: 15_000 });
    // Not just a URL change — the actual authenticated shell (nav) rendered.
    await expect(page.getByRole("link", { name: /appraisals/i }).first()).toBeVisible();
  });

  test("invalid credentials show an error and stay on the login page", async ({ page }) => {
    await page.goto("login");
    await page.locator("#identifier").fill(EMPLOYEE_SELF_ASSESSMENT.email);
    await page.locator("#password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
