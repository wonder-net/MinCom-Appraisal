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
  createComment,
  upsertGrowthPlan,
} from "./support/api";
import { EMPLOYEE_SIGN_OFF, MANAGER, PERSPECTIVES } from "./support/constants";
import { loginViaUi, goToAppraisal } from "./support/ui";

const kdDescription = (key: string) => `E2E Test KPI — sign-off — ${key}`;

let appraisalId: string;
// Manager's beforeAll login is reused for the final verification call —
// one fewer login keeps this comfortably under the `auth` rate limiter
// (10/min — see e2e/README.md).
let managerSetupToken: string;

test.beforeAll(async () => {
  test.setTimeout(90_000); // this fixture walks an appraisal through 5 real transitions via the API
  const cycleId = process.env.E2E_CYCLE_ID!;
  const employeeToken = await login(EMPLOYEE_SIGN_OFF.email, EMPLOYEE_SIGN_OFF.password);
  const managerToken = await login(MANAGER.email, MANAGER.password);
  managerSetupToken = managerToken;

  const appraisal = await findAppraisalForEmployeeNumber(employeeToken, cycleId, EMPLOYEE_SIGN_OFF.employeeNumber);
  appraisalId = appraisal.id;

  // Fast-forward, via the real API, through every step this spec ISN'T
  // testing (self-assessment/manager-review are their own specs) so
  // the browser interaction here is purely the sign-off action itself
  // — for both parties, since PENDING_SIGNOFF requires both accepts
  // (this employee has no matrix appraiser, so just appraisee + manager).
  // One KD per BSC perspective, at that perspective's real weight cap —
  // the appraisal's total KD weight must reach 100% for the
  // self/manager-side transition guards to pass.
  const kds = [];
  for (const p of PERSPECTIVES) {
    const kd = await createDeliverable(employeeToken, appraisalId, {
      description: kdDescription(p.key),
      weight: p.weight,
      perspective: p.key,
    });
    await rateDeliverable(employeeToken, appraisalId, kd.id, { self_rating: 4 });
    kds.push(kd);
  }
  const ratings = await listCompetencyRatings(employeeToken, appraisalId);
  for (const r of ratings) await rateCompetency(employeeToken, appraisalId, r.id, { self_rating: "5.0" });

  let current = await getAppraisal(employeeToken, appraisalId);
  await transition(employeeToken, appraisalId, "MANAGER_REVIEW", current.version);

  for (const kd of kds) await rateDeliverable(managerToken, appraisalId, kd.id, { manager_rating: 4 });
  for (const r of ratings) await rateCompetency(managerToken, appraisalId, r.id, { manager_rating: "6.0" });

  current = await getAppraisal(managerToken, appraisalId);
  await transition(managerToken, appraisalId, "DISCUSSION", current.version);

  await createComment(employeeToken, appraisalId, "E2E fixture: appraisee discussion comment.");
  await createComment(managerToken, appraisalId, "E2E fixture: appraiser discussion comment.");

  current = await getAppraisal(managerToken, appraisalId);
  await transition(managerToken, appraisalId, "GROWTH_PLANNING", current.version);

  await upsertGrowthPlan(managerToken, appraisalId, {
    overall_assessment: "E2E fixture overall assessment.",
    strengths_weaknesses: [
      { type: "STRENGTH", description: "E2E fixture strength.", sort_order: 0 },
      { type: "WEAKNESS", description: "E2E fixture weakness.", sort_order: 0 },
    ],
    training_needs: [{ type: "ON_THE_JOB", description: "E2E fixture training need.", priority: "FIRST" }],
  });

  current = await getAppraisal(managerToken, appraisalId);
  await transition(managerToken, appraisalId, "PENDING_SIGNOFF", current.version);
});

test("appraisee and manager both accept sign-off, completing the appraisal", async ({ browser }) => {
  test.setTimeout(60_000); // two full browser-context logins + interactions
  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  await loginViaUi(employeePage, EMPLOYEE_SIGN_OFF.email, EMPLOYEE_SIGN_OFF.password);
  await goToAppraisal(employeePage, appraisalId);
  await employeePage.getByRole("tab", { name: "Sign-off" }).click();
  // Unlike TransitionActions' workflow-stage buttons, SignoffSection's
  // Accept button has no confirm dialog — it submits directly.
  await employeePage.getByRole("button", { name: "Accept appraisal sign-off" }).click();
  await expect(employeePage.getByText(/waiting for the other party/i)).toBeVisible({ timeout: 15_000 });
  await employeeContext.close();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await loginViaUi(managerPage, MANAGER.email, MANAGER.password);
  await goToAppraisal(managerPage, appraisalId);
  await managerPage.getByRole("tab", { name: "Sign-off" }).click();
  await managerPage.getByRole("button", { name: "Accept appraisal sign-off" }).click();
  await expect(managerPage.getByText("Signed Off").first()).toBeVisible({ timeout: 15_000 });
  await managerContext.close();

  const after = await getAppraisal(managerSetupToken, appraisalId);
  expect(after.status).toBe("SIGNED_OFF");
});
