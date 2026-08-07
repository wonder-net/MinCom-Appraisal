import { test, expect } from "@playwright/test";
import { ADMIN } from "./support/constants";
import { loginViaUi } from "./support/ui";

/**
 * Unique per run so this is safely re-runnable against a persistent
 * database (not just a fresh CI one) without ever hitting the "a user
 * with this email already exists" 409.
 */
const uniqueEmail = `e2e-${Date.now()}@mincom.test`;

test("HR admin creates a new user account", async ({ page }) => {
  await loginViaUi(page, ADMIN.email, ADMIN.password);

  await page.goto("admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  await page.getByRole("button", { name: "+ Add User" }).click();
  await expect(page.getByRole("dialog", { name: "Add User" })).toBeVisible();

  await page.locator("#new-full-name").fill("E2E Test User");
  await page.locator("#new-email").fill(uniqueEmail);
  await page.locator("#new-role").selectOption("EMPLOYEE");

  await page.getByRole("button", { name: "Create User" }).click();

  // Dialog closes and the new user shows up in the list — proves the
  // create round-trip (POST /api/v1/admin/users/ + list refresh) works,
  // not just that the form submitted without erroring.
  await expect(page.getByRole("dialog", { name: "Add User" })).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("cell", { name: uniqueEmail })).toBeVisible({ timeout: 15_000 });
});
