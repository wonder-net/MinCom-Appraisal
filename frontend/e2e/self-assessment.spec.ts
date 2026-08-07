import { test, expect } from "@playwright/test";
import {
  login,
  createDeliverable,
  listCompetencyRatings,
  findAppraisalForEmployeeNumber,
  getAppraisal,
} from "./support/api";
import { EMPLOYEE_SELF_ASSESSMENT, PERSPECTIVES } from "./support/constants";
import { loginViaUi, goToAppraisal } from "./support/ui";

const kdDescription = (key: string) => `E2E Test KPI — self-assessment — ${key}`;

let appraisalId: string;
// Reused for the final verification call at the end of the test too —
// one fewer login keeps this comfortably under the `auth` rate limiter
// (10/min, a real production control this suite shouldn't need to
// weaken — see e2e/README.md).
let setupToken: string;

test.beforeAll(async () => {
  const cycleId = process.env.E2E_CYCLE_ID!;
  setupToken = await login(EMPLOYEE_SELF_ASSESSMENT.email, EMPLOYEE_SELF_ASSESSMENT.password);
  const token = setupToken;
  const appraisal = await findAppraisalForEmployeeNumber(token, cycleId, EMPLOYEE_SELF_ASSESSMENT.employeeNumber);
  appraisalId = appraisal.id;

  // Only the KD rows themselves are seeded — their ratings are what the
  // test actually drives through the UI. One KD per BSC perspective, at
  // that perspective's real weight cap, so the 4 rows sum to exactly
  // 100% (the SELF_ASSESSMENT -> MANAGER_REVIEW guard requires the
  // appraisal's total KD weight to reach 100%, not just each KD to have
  // a rating). CompetencyRatings already exist (auto-created at cycle
  // activation), also unrated.
  for (const p of PERSPECTIVES) {
    await createDeliverable(token, appraisalId, {
      description: kdDescription(p.key),
      weight: p.weight,
      perspective: p.key,
    });
  }
});

test("employee rates their KPIs + Mincom Core Values and submits the self-assessment", async ({ page }) => {
  await loginViaUi(page, EMPLOYEE_SELF_ASSESSMENT.email, EMPLOYEE_SELF_ASSESSMENT.password);
  await goToAppraisal(page, appraisalId);

  // --- Key Performance Indicators tab (default tab) ---
  await expect(page.getByRole("tab", { name: "Key Performance Indicators" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  for (const p of PERSPECTIVES) {
    const description = kdDescription(p.key);
    await page.getByRole("button", { name: `Edit ${description}` }).click();
    await page.getByLabel("Edit self rating").selectOption("4");
    await page.getByLabel("Save changes").click();
    await expect(page.getByLabel("Edit self rating")).toHaveCount(0); // edit mode closed
  }

  // --- Mincom Core Values Ratings tab ---
  await page.getByRole("tab", { name: "Competencies" }).click();
  const selfRatingSelects = page.locator('select[aria-label^="Self rating for"]');
  await expect(selfRatingSelects).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await selfRatingSelects.nth(i).selectOption("5.0");
  }

  // --- Submit ---
  await page.getByRole("button", { name: "Submit Self-Assessment" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Submit Self-Assessment" })
    .click();

  // The "Submit Self-Assessment" action is only offered in
  // SELF_ASSESSMENT status — its disappearance is a real signal the UI
  // believes the transition succeeded (the stepper's "Mgr Review" label
  // is always present regardless of status, so isn't a useful signal
  // here). The API check right after is the authoritative assertion.
  await expect(page.getByRole("button", { name: "Submit Self-Assessment" })).toHaveCount(0, { timeout: 15_000 });

  const after = await getAppraisal(setupToken, appraisalId);
  expect(after.status).toBe("MANAGER_REVIEW");

  const ratings = await listCompetencyRatings(setupToken, appraisalId);
  expect(ratings.length).toBeGreaterThan(0);
});
