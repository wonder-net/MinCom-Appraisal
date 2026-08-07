import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config — runs against a REAL running instance of the app (the
 * live MAMP-served deployment by default), not a mocked/dev server.
 * This is deliberate: the bug class these tests exist to catch (see
 * e2e/README.md) — blank pages from Apache routing gaps, 404ing asset
 * paths — only reproduces against the actual Apache/.htaccess/off-root
 * Alias setup, never against Vite's dev server or a unit-test harness.
 *
 * Override the target with E2E_BASE_URL (e.g. for a staging deploy);
 * defaults to this machine's MAMP instance.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8888/MinCom-Appraisal/";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
