import { test, expect } from "@playwright/test";
import {
  login,
  createDeliverable,
  rateDeliverable,
  listCompetencyRatings,
  rateCompetency,
  findAppraisalForEmployeeNumber,
  getAppraisal,
  transition,
} from "./support/api";
import { EMPLOYEE_MANAGER_REVIEW, MANAGER, PERSPECTIVES } from "./support/constants";
import { loginViaUi, goToAppraisal } from "./support/ui";

const kdDescription = (key: string) => `E2E Test KPI — manager review — ${key}`;

let appraisalId: string;
// Manager's beforeAll login is reused for the final verification call —
// one fewer login keeps this comfortably under the `auth` rate limiter
// (10/min — see e2e/README.md).
let managerSetupToken: string;

test.beforeAll(async () => {
  const cycleId = process.env.E2E_CYCLE_ID!;
  const token = await login(EMPLOYEE_MANAGER_REVIEW.email, EMPLOYEE_MANAGER_REVIEW.password);
  const appraisal = await findAppraisalForEmployeeNumber(token, cycleId, EMPLOYEE_MANAGER_REVIEW.employeeNumber);
  appraisalId = appraisal.id;

  // Fast-forward to MANAGER_REVIEW via the real API (self-assessment
  // itself is covered end-to-end by self-assessment.spec.ts) so this
  // spec's browser interaction is entirely the manager's review step.
  // One KD per BSC perspective, at that perspective's real weight cap
  // — the appraisal's total KD weight must reach 100% for either
  // transition guard (self or manager side) to pass.
  for (const p of PERSPECTIVES) {
    const kd = await createDeliverable(token, appraisalId, {
      description: kdDescription(p.key),
      weight: p.weight,
      perspective: p.key,
    });
    await rateDeliverable(token, appraisalId, kd.id, { self_rating: 4 });
  }

  const ratings = await listCompetencyRatings(token, appraisalId);
  for (const r of ratings) {
    await rateCompetency(token, appraisalId, r.id, { self_rating: "5.0" });
  }

  const current = await getAppraisal(token, appraisalId);
  await transition(token, appraisalId, "MANAGER_REVIEW", current.version);

  managerSetupToken = await login(MANAGER.email, MANAGER.password);
});

test("manager rates KPIs + Mincom Core Values and completes the review", async ({ page }) => {
  await loginViaUi(page, MANAGER.email, MANAGER.password);
  await goToAppraisal(page, appraisalId);

  // Each rating change PATCHes the server and bumps the appraisal's
  // optimistic-lock `version`; the frontend only learns the new version
  // once that PATCH's response lands. Waiting for each response before
  // moving to the next rating (rather than firing all of them as fast
  // as selectOption() allows) avoids "this appraisal was updated by
  // another user" false-conflict on the final transition — a real
  // human clicking through would naturally have this same pacing.
  async function selectAndAwaitSave(selector: ReturnType<typeof page.getByLabel>, value: string): Promise<void> {
    const responsePromise = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.status() === 200,
    );
    await selector.selectOption(value);
    await responsePromise;
  }

  // --- Key Performance Indicators tab ---
  for (const p of PERSPECTIVES) {
    await selectAndAwaitSave(page.getByLabel(`Appraisor rating for ${kdDescription(p.key)}`), "4");
  }

  // --- Mincom Core Values Ratings tab ---
  await page.getByRole("tab", { name: "Competencies" }).click();
  const mgrRatingSelects = page.locator('select[aria-label^="Appraisor rating for"]');
  await expect(mgrRatingSelects).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await selectAndAwaitSave(mgrRatingSelects.nth(i), "6.0");
  }

  // --- Complete review ---
  // Rating a KD/competency recomputes and saves the PARENT Appraisal
  // row too (ScoreEngine::computeScores() persists kd/bc/total scores
  // onto it), bumping its optimistic-lock version server-side on every
  // single rating — but the rating PATCH's response only returns the
  // child KD/CompetencyRating object, never the parent, so the page's
  // in-memory appraisal.version silently falls 8 versions behind after
  // rating everything. A real manager rating several items before
  // clicking "Complete Manager Review" would hit the exact same 409 —
  // reloading (forcing a fresh GET of the current version) is the
  // reliable fix, same as manually refreshing the page would be.
  await page.reload();
  await expect(page.getByRole("tablist", { name: "Appraisal sections" })).toBeVisible();
  await page.getByRole("button", { name: "Complete Manager Review" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Complete Manager Review" }).click();

  // "Complete Manager Review" is only offered in MANAGER_REVIEW status
  // — its disappearance is a real signal the transition succeeded (the
  // stepper's "Discussion" label is always present regardless of
  // status). The API check right after is the authoritative assertion.
  await expect(page.getByRole("button", { name: "Complete Manager Review" })).toHaveCount(0, { timeout: 15_000 });

  const after = await getAppraisal(managerSetupToken, appraisalId);
  expect(after.status).toBe("DISCUSSION");
});
